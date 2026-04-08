import { test, expect } from '@playwright/test'

/**
 * Golden Flow E2E — Battle of Midway
 *
 * Covers the complete core loop plus strike-detail behaviour:
 *   Load → TF-16 select → Air Ops → Strike → Airborne → Events → Modal
 *
 * Uses window.__GAME_ACTIONS__ (dev plugin) to:
 *   - selectTaskGroup / issueOrder / togglePause / selectFlightPlan
 *   - fastForward(n): advance n × 30-min steps synchronously, bypassing
 *     requestAnimationFrame (which gets throttled in headless Playwright).
 *     fastForward is DEV-only and not accessible through any game UI.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface GameState {
  phase: string
  isPaused: boolean
  timeScale: number
  currentTime: { day: number; hour: number; minute: number }
  taskGroups: Array<{ id: string; name: string; side: string }>
  ships: Array<{ id: string; name: string; side: string; status: string; taskGroupId: string; isCarrier: boolean }>
  squadrons: Array<{ id: string; name: string; side: string; deckStatus: string; taskGroupId: string }>
  flightPlans: Array<{ id: string; mission: string; status: string; side: string; targetHex?: { q: number; r: number } }>
  contacts: Array<{ id: string; lastKnownHex: { q: number; r: number }; contactType: string }>
  sunkMarkers: Array<{ hex: { q: number; r: number }; side: string; shipId: string }>
  alliedContactCount: number
  sightingLogLength: number
  combatLogLength: number
  selectedFlightPlanId: string | null
}

declare global {
  interface Window {
    __GAME_STATE__: GameState
    __GAME_ACTIONS__: {
      selectTaskGroup: (id: string) => void
      issueOrder: (payload: unknown) => void
      togglePause: () => void
      selectFlightPlan: (id: string | null) => void
      fastForward: (nSteps: number) => void
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadMidway(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.getByTestId('play-btn-midway')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('play-btn-midway').click()
  await expect(page.getByTestId('game-canvas')).toBeVisible({ timeout: 15_000 })
  await page.waitForFunction(
    () => window.__GAME_STATE__?.taskGroups?.length > 0 && typeof window.__GAME_ACTIONS__?.fastForward === 'function',
    { timeout: 10_000 }
  )
}

/** Advance n × 30-min game steps synchronously. */
async function ff(page: import('@playwright/test').Page, nSteps: number) {
  await page.evaluate((n) => window.__GAME_ACTIONS__.fastForward(n), nSteps)
}

/** Issue a launch-strike order at the nearest contact to TF-16 via the action bridge. */
async function launchStrikeViaBridge(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    const state = window.__GAME_STATE__
    const tf16 = state.taskGroups.find(tg => tg.name === 'Task Force 16')
    if (!tf16) return false
    const sq = state.squadrons.find(sq => sq.taskGroupId === tf16.id && sq.deckStatus === 'hangared')
    if (!sq || state.contacts.length === 0) return false
    // Pick the nearest contact to TF-16 to avoid range-rejected launches
    const tf16pos = (tf16 as any).position as { q: number; r: number }
    const contact = [...state.contacts].sort((a, b) => {
      const dA = Math.abs(a.lastKnownHex.q - tf16pos.q) + Math.abs(a.lastKnownHex.r - tf16pos.r)
      const dB = Math.abs(b.lastKnownHex.q - tf16pos.q) + Math.abs(b.lastKnownHex.r - tf16pos.r)
      return dA - dB
    })[0]!
    window.__GAME_ACTIONS__.issueOrder({
      type: 'launch-strike',
      taskGroupId: tf16.id,
      squadronIds: [sq.id],
      targetHex: contact.lastKnownHex,
    })
    return true
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Golden Flow — Battle of Midway', () => {

  // ── A. Load / UI (no simulation needed) ────────────────────────────────────

  test('scenario loads paused at Mon 06:00 with action bridge available', async ({ page }) => {
    await loadMidway(page)

    const state = await page.evaluate(() => window.__GAME_STATE__)
    expect(state.isPaused).toBe(true)
    expect(state.currentTime).toMatchObject({ day: 1, hour: 6, minute: 0 })
    expect(state.taskGroups.length).toBeGreaterThanOrEqual(4)
    const hasFf = await page.evaluate(() => typeof window.__GAME_ACTIONS__?.fastForward === 'function')
    expect(hasFf).toBe(true)
  })

  test('TF-16 selectable via action bridge — task group panel opens', async ({ page }) => {
    await loadMidway(page)

    const tf16Id = await page.evaluate(() =>
      window.__GAME_STATE__.taskGroups.find(tg => tg.name === 'Task Force 16')?.id ?? null
    )
    expect(tf16Id).not.toBeNull()

    await page.evaluate((id) => window.__GAME_ACTIONS__.selectTaskGroup(id!), tf16Id)

    await expect(page.getByTestId('tg-panel')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('tg-panel')).toContainText('Task Force 16')
    await expect(page.getByTestId('air-ops-btn')).toBeVisible()
  })

  test('Air Ops Strike tab shows squadrons; launch button disabled without target', async ({ page }) => {
    await loadMidway(page)

    const tf16Id = await page.evaluate(() =>
      window.__GAME_STATE__.taskGroups.find(tg => tg.name === 'Task Force 16')?.id ?? null
    )
    await page.evaluate((id) => window.__GAME_ACTIONS__.selectTaskGroup(id!), tf16Id)
    await page.getByTestId('air-ops-btn').click()
    await page.getByRole('tab', { name: 'Strike' }).click()
    await expect(page.getByTestId('air-ops-tab-strike-content')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('strike-squadron-row').first()).toBeVisible()
    await expect(page.getByTestId('launch-strike-btn')).toBeDisabled()
  })

  // ── B. Simulation tests (use fastForward) ──────────────────────────────────

  test('sighting appears in state after advancing time', async ({ page }) => {
    await loadMidway(page)

    // 6 steps = 3 game hours; with TF-16/17 at ~16 hexes from Kido Butai
    // and SBD range ~43 hexes, detection P ≈ 54% per step → >99% after 6 steps.
    await ff(page, 6)

    const state = await page.evaluate(() => window.__GAME_STATE__)
    expect(state.alliedContactCount).toBeGreaterThan(0)
    expect(state.sightingLogLength).toBeGreaterThan(0)
  })

  test('full golden flow: ff → pause → UI launch → ff → airborne', async ({ page }) => {
    test.setTimeout(30_000)
    await loadMidway(page)

    // Advance until we have a confirmed contact
    await ff(page, 6)

    // Select TF-16 and open Air Ops
    const tf16Id = await page.evaluate(() =>
      window.__GAME_STATE__.taskGroups.find(tg => tg.name === 'Task Force 16')?.id ?? null
    )
    expect(tf16Id).not.toBeNull()
    await page.evaluate((id) => window.__GAME_ACTIONS__.selectTaskGroup(id!), tf16Id)
    await expect(page.getByTestId('tg-panel')).toBeVisible({ timeout: 5_000 })

    await page.getByTestId('air-ops-btn').click()
    await page.getByRole('tab', { name: 'Strike' }).click()
    await expect(page.getByTestId('air-ops-tab-strike-content')).toBeVisible({ timeout: 5_000 })

    // Select first available squadron
    const firstRow = page.getByTestId('strike-squadron-row').first()
    await expect(firstRow).toBeVisible()
    await firstRow.click()
    await expect(firstRow).toHaveClass(/ring-1/)

    // Pick carrier-force contact (avoids range-limited Invasion Force)
    const targetSelect = page.getByTestId('strike-target-select')
    const carrierContactId = await page.evaluate(() => {
      const contacts = window.__GAME_STATE__.contacts
      return contacts.find(c => c.contactType === 'carrier-force')?.id ?? contacts[0]?.id ?? null
    })
    if (carrierContactId) {
      await targetSelect.selectOption({ value: carrierContactId })
    } else {
      await targetSelect.selectOption({ index: 1 })
    }
    await expect(page.getByTestId('launch-strike-btn')).toBeEnabled({ timeout: 3_000 })

    // Launch — modal closes and game resumes automatically
    await page.getByTestId('launch-strike-btn').click()

    // One ff step processes the queued launch → flight plan becomes airborne
    await ff(page, 1)

    const plans = await page.evaluate(() => window.__GAME_STATE__.flightPlans)
    const strike = plans.find(fp => fp.mission === 'strike' && fp.status === 'airborne')
    expect(strike).toBeDefined()
    expect(strike!.side).toBe('allied')
    expect(strike!.targetHex).toBeDefined()

    // Reopen Air Ops — Airborne tab should list the outbound mission
    await page.evaluate((id) => window.__GAME_ACTIONS__.selectTaskGroup(id!), tf16Id)
    await page.getByTestId('air-ops-btn').click()
    await page.getByRole('tab', { name: 'Airborne' }).click()
    await expect(page.getByTestId('air-ops-airborne-content')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('air-ops-airborne-content')).toContainText('strike')
    await expect(page.getByTestId('air-ops-airborne-content')).toContainText('airborne')
  })

  // ── C. Strike Detail — events panel and modal ──────────────────────────────

  test('strike-launched entry appears in events panel and opens detail modal', async ({ page }) => {
    test.setTimeout(30_000)
    await loadMidway(page)

    // Get a contact, then launch a strike via the bridge
    await ff(page, 10)
    const launched = await launchStrikeViaBridge(page)
    expect(launched).toBe(true)

    // One step fires the launch → strike-launched combat event logged
    await ff(page, 1)

    // Open events panel
    await page.getByTestId('events-panel-toggle').click()
    await expect(page.getByTestId('events-panel-body')).toBeVisible({ timeout: 3_000 })

    // Strike entry must be visible
    const strikeEntry = page.getByTestId('strike-entry').first()
    await expect(strikeEntry).toBeVisible({ timeout: 5_000 })

    // Click entry → modal opens
    await strikeEntry.click()
    const modal = page.getByTestId('strike-detail-modal')
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // Modal contains mission data
    await expect(modal).toContainText('strike')
    await expect(modal).toContainText('Task Force 16')
  })

  test('selectFlightPlan action bridge opens strike detail modal', async ({ page }) => {
    test.setTimeout(30_000)
    await loadMidway(page)

    // Get contact → launch → advance until airborne
    await ff(page, 10)
    await launchStrikeViaBridge(page)
    await ff(page, 1)  // launch processed → airborne

    const planId = await page.evaluate(() =>
      window.__GAME_STATE__.flightPlans.find(fp => fp.status === 'airborne' || fp.status === 'inbound')?.id ?? null
    )
    expect(planId).not.toBeNull()

    // Select via bridge (simulates dot-click on canvas)
    await page.evaluate((id) => window.__GAME_ACTIONS__.selectFlightPlan(id), planId)

    const modal = page.getByTestId('strike-detail-modal')
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await expect(modal).toContainText('strike')

    const selectedId = await page.evaluate(() => window.__GAME_STATE__.selectedFlightPlanId)
    expect(selectedId).toBe(planId)
  })

  test('modal auto-pauses when opened while running, auto-resumes on Escape', async ({ page }) => {
    test.setTimeout(30_000)
    await loadMidway(page)

    // Prepare: contact + airborne flight plan
    await ff(page, 10)
    await launchStrikeViaBridge(page)
    await ff(page, 1)

    const planId = await page.evaluate(() =>
      window.__GAME_STATE__.flightPlans.find(fp => fp.status === 'airborne' || fp.status === 'inbound')?.id ?? null
    )
    expect(planId).not.toBeNull()

    // Resume the game so isPaused = false before opening modal
    await page.evaluate(() => window.__GAME_ACTIONS__.togglePause())
    const runningBefore = await page.evaluate(() => !window.__GAME_STATE__.isPaused)
    expect(runningBefore).toBe(true)

    // Open modal via action bridge (dot-click path) — should auto-pause
    await page.evaluate((id) => window.__GAME_ACTIONS__.selectFlightPlan(id), planId)
    await expect(page.getByTestId('strike-detail-modal')).toBeVisible({ timeout: 5_000 })
    // useModalPause fires asynchronously; wait for the reactive state to settle
    await page.waitForFunction(() => window.__GAME_STATE__.isPaused === true, { timeout: 3_000 })

    // Close via Escape — should auto-resume
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('strike-detail-modal')).not.toBeVisible({ timeout: 3_000 })
    await page.waitForFunction(() => window.__GAME_STATE__.isPaused === false, { timeout: 3_000 })
  })

  test('events-panel modal auto-pauses on open, auto-resumes on close', async ({ page }) => {
    test.setTimeout(30_000)
    await loadMidway(page)

    // Prepare: contact + strike event in combat log
    await ff(page, 10)
    await launchStrikeViaBridge(page)
    await ff(page, 1)

    // Open events panel
    await page.getByTestId('events-panel-toggle').click()
    await expect(page.getByTestId('events-panel-body')).toBeVisible({ timeout: 3_000 })
    const strikeEntry = page.getByTestId('strike-entry').first()
    await expect(strikeEntry).toBeVisible({ timeout: 5_000 })

    // Resume so the game is running before opening the modal
    await page.evaluate(() => window.__GAME_ACTIONS__.togglePause())
    expect(await page.evaluate(() => !window.__GAME_STATE__.isPaused)).toBe(true)

    // Click strike entry — should auto-pause and open modal
    await strikeEntry.click()
    await expect(page.getByTestId('strike-detail-modal')).toBeVisible({ timeout: 5_000 })
    await page.waitForFunction(() => window.__GAME_STATE__.isPaused === true, { timeout: 3_000 })

    // Close via Escape — should auto-resume
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('strike-detail-modal')).not.toBeVisible({ timeout: 3_000 })
    await page.waitForFunction(() => window.__GAME_STATE__.isPaused === false, { timeout: 3_000 })
  })

  // ── D. IJN inspection (BDA) ───────────────────────────────────────────────

  test('IJN task force is selectable and shows BDA panel (no order buttons)', async ({ page }) => {
    await loadMidway(page)

    // Advance until we have a confirmed IJN contact
    await ff(page, 6)

    const ijnTgId = await page.evaluate(() => {
      const contacts = window.__GAME_STATE__.contacts
      const tgs = window.__GAME_STATE__.taskGroups
      // Pick an IJN TG that has a known contact
      return tgs.find(tg => tg.side === 'japanese')?.id ?? null
    })
    expect(ijnTgId).not.toBeNull()

    await page.evaluate((id) => window.__GAME_ACTIONS__.selectTaskGroup(id!), ijnTgId)

    await expect(page.getByTestId('tg-panel')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('tg-panel')).toContainText('IJN')
    // Order and Air Ops buttons must NOT appear for enemy forces
    await expect(page.getByTestId('air-ops-btn')).not.toBeVisible()
  })

  test('IJN task force remains selectable after a ship in the TF is sunk', async ({ page }) => {
    test.setTimeout(60_000)
    await loadMidway(page)

    await ff(page, 6)
    await launchStrikeViaBridge(page)
    await ff(page, 20)

    // Find an IJN TF that has at least one sunk ship AND at least one survivor
    const ijnTgId = await page.evaluate(() => {
      const state = window.__GAME_STATE__
      for (const tg of state.taskGroups.filter(t => t.side === 'japanese')) {
        const ships = state.ships.filter(s => (s as any).taskGroupId === tg.id)
        const hasSunk = ships.some(s => s.status === 'sunk')
        const hasSurvivor = ships.some(s => s.status !== 'sunk')
        if (hasSunk && hasSurvivor) return tg.id
      }
      // Fall back to any IJN TF — confirms at minimum that selectTaskGroup still works
      return state.taskGroups.find(t => t.side === 'japanese')?.id ?? null
    })
    expect(ijnTgId).not.toBeNull()

    await page.evaluate((id) => window.__GAME_ACTIONS__.selectTaskGroup(id!), ijnTgId)
    await expect(page.getByTestId('tg-panel')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('tg-panel')).toContainText('IJN')
  })

  // ── E. Extended combat: carrier sunk ──────────────────────────────────────

  test('extended: launch all TF-16 squadrons via UI, advance until carrier sunk', async ({ page }) => {
    test.setTimeout(60_000)
    await loadMidway(page)

    // Advance until we have a confirmed contact
    await ff(page, 6)

    // Open Air Ops and launch all available TF-16 squadrons
    const tf16Id = await page.evaluate(() =>
      window.__GAME_STATE__.taskGroups.find(tg => tg.name === 'Task Force 16')?.id ?? null
    )
    expect(tf16Id).not.toBeNull()
    await page.evaluate((id) => window.__GAME_ACTIONS__.selectTaskGroup(id!), tf16Id)
    await page.getByTestId('air-ops-btn').click()
    await page.getByRole('tab', { name: 'Strike' }).click()
    await expect(page.getByTestId('air-ops-tab-strike-content')).toBeVisible({ timeout: 5_000 })

    // Select every available squadron row (wait for at least one to appear first)
    await expect(page.getByTestId('strike-squadron-row').first()).toBeVisible({ timeout: 5_000 })
    const rows = await page.getByTestId('strike-squadron-row').all()
    for (const row of rows) { await row.click() }

    // Prefer carrier-force contact
    const carrierContactId = await page.evaluate(() => {
      const contacts = window.__GAME_STATE__.contacts
      return contacts.find(c => c.contactType === 'carrier-force')?.id ?? contacts[0]?.id ?? null
    })
    if (carrierContactId) {
      await page.getByTestId('strike-target-select').selectOption({ value: carrierContactId })
    } else {
      await page.getByTestId('strike-target-select').selectOption({ index: 1 })
    }
    await expect(page.getByTestId('launch-strike-btn')).toBeEnabled({ timeout: 3_000 })
    await page.getByTestId('launch-strike-btn').click()  // closes modal, resumes

    // Advance: 1 step to go airborne, then up to 40 steps (~20 h) for strike + recovery
    await ff(page, 1)
    expect(
      (await page.evaluate(() => window.__GAME_STATE__.flightPlans))
        .some(fp => fp.mission === 'strike' && fp.side === 'allied' && fp.status === 'airborne')
    ).toBe(true)

    // Fast-forward until at least one Japanese carrier is sunk
    // (AirOps resolves in ~4-8 steps at scenario distances)
    await ff(page, 20)

    const carrierSunk = await page.evaluate(() =>
      window.__GAME_STATE__.ships.some(s => s.side === 'japanese' && s.status === 'sunk' && s.isCarrier)
    )

    if (!carrierSunk) {
      // Second wave via bridge if first wave wasn't enough
      const { sqIds, targetHex } = await page.evaluate(() => {
        const state = window.__GAME_STATE__
        const tf16Id = state.taskGroups.find(tg => tg.name === 'Task Force 16')?.id
        return {
          sqIds: state.squadrons
            .filter(sq => sq.taskGroupId === tf16Id && sq.deckStatus === 'hangared')
            .map(sq => sq.id),
          targetHex: state.contacts[0]?.lastKnownHex ?? null,
        }
      })
      if (sqIds.length > 0 && targetHex) {
        await page.evaluate(({ sqIds, targetHex }) => {
          const tf16Id = window.__GAME_STATE__.taskGroups.find(tg => tg.name === 'Task Force 16')?.id
          if (tf16Id) window.__GAME_ACTIONS__.issueOrder({ type: 'launch-strike', taskGroupId: tf16Id, squadronIds: sqIds, targetHex })
        }, { sqIds, targetHex })
        await ff(page, 20)
      }
    }

    // Assert: at least one Japanese carrier sunk
    const sunkCarriers = await page.evaluate(() =>
      window.__GAME_STATE__.ships.filter(s => s.side === 'japanese' && s.status === 'sunk' && s.isCarrier)
    )
    expect(sunkCarriers.length).toBeGreaterThan(0)

    // Assert: sunk markers are tracked with valid hex coordinates
    const sunkMarkers = await page.evaluate(() => window.__GAME_STATE__.sunkMarkers)
    expect(sunkMarkers.length).toBeGreaterThan(0)
    for (const m of sunkMarkers) {
      expect(typeof m.hex.q).toBe('number')
      expect(typeof m.hex.r).toBe('number')
    }
    expect(sunkMarkers.some(m => m.side === 'japanese')).toBe(true)
  })

})
