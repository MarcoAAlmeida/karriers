import { test, expect } from '@playwright/test'

/**
 * Golden Flow E2E — Battle of Midway
 *
 * Proves the absolute core loop end-to-end:
 *   Load → Resume → Sighting → Select TF-16 → Air Ops → Strike → Airborne
 *
 * Uses window.__GAME_ACTIONS__ (dev plugin) to select the task group without
 * depending on canvas pixel coordinates, keeping the test deterministic.
 */

interface FlightPlanState {
  id: string
  mission: string
  status: string
  side: string
  targetHex?: { q: number; r: number }
}

interface ShipState {
  id: string
  name: string
  side: string
  status: string
  taskGroupId: string
  isCarrier: boolean
}

interface ContactState {
  id: string
  lastKnownHex: { q: number; r: number }
  contactType: string
  confirmedTaskGroupId?: string
}

interface GameState {
  phase: string
  isPaused: boolean
  timeScale: number
  currentTime: { day: number; hour: number; minute: number }
  taskGroups: Array<{ id: string; name: string; side: string }>
  ships: ShipState[]
  squadrons: Array<{ id: string; name: string; side: string; deckStatus: string; taskGroupId: string }>
  flightPlans: FlightPlanState[]
  contacts: ContactState[]
  sunkMarkers: Array<{ hex: { q: number; r: number }; side: string; shipId: string }>
  alliedContactCount: number
  sightingLogLength: number
  combatLogLength: number
}

declare global {
  interface Window {
    __GAME_STATE__: GameState
    __GAME_ACTIONS__: {
      selectTaskGroup: (id: string) => void
      issueOrder: (payload: unknown) => void
      togglePause: () => void
    }
  }
}

// ── Shared load helper ────────────────────────────────────────────────────────

async function loadMidway(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.getByTestId('play-btn-midway')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('play-btn-midway').click()
  await expect(page.getByTestId('game-canvas')).toBeVisible({ timeout: 15_000 })
  await page.waitForFunction(
    () => {
      const s = window.__GAME_STATE__
      return s?.taskGroups?.length > 0
    },
    { timeout: 10_000 }
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Golden Flow — Strike mission end-to-end', () => {

  test('Step 1: scenario loads paused at Mon 06:00 with game actions available', async ({ page }) => {
    await loadMidway(page)

    const state = await page.evaluate(() => window.__GAME_STATE__)
    expect(state.isPaused).toBe(true)
    expect(state.currentTime).toMatchObject({ day: 1, hour: 6, minute: 0 })
    expect(state.taskGroups.length).toBeGreaterThanOrEqual(4)

    // Action bridge must be present
    const hasActions = await page.evaluate(() => typeof window.__GAME_ACTIONS__?.selectTaskGroup === 'function')
    expect(hasActions).toBe(true)
  })

  test('Step 2: time runs and a sighting appears in the Intel Log', async ({ page }) => {
    await loadMidway(page)

    // Set 8× speed, then resume
    await page.getByTestId('hud-time-controls').getByRole('button', { name: '8×' }).click()
    await page.getByTestId('play-pause-btn').click()
    await expect(page.getByTestId('play-pause-btn')).toHaveAttribute('aria-label', /Pause/)

    // Wait for at least one sighting entry
    await page.waitForFunction(
      () => window.__GAME_STATE__?.sightingLogLength > 0,
      { timeout: 30_000 }
    )

    const state = await page.evaluate(() => window.__GAME_STATE__)
    expect(state.sightingLogLength).toBeGreaterThan(0)
    expect(state.alliedContactCount).toBeGreaterThan(0)
  })

  test('Step 3: TF-16 can be selected and the task group panel opens', async ({ page }) => {
    await loadMidway(page)

    // TF-16 should be in the task groups
    const tf16Id = await page.evaluate(() => {
      const state = window.__GAME_STATE__
      return state.taskGroups.find(tg => tg.name === 'Task Force 16')?.id ?? null
    })
    expect(tf16Id).not.toBeNull()

    // Select via action bridge (avoids canvas pixel dependency)
    await page.evaluate((id) => window.__GAME_ACTIONS__.selectTaskGroup(id!), tf16Id)

    await expect(page.getByTestId('tg-panel')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('tg-panel')).toContainText('Task Force 16')

    // Air Ops button present (TF-16 has carriers)
    await expect(page.getByTestId('air-ops-btn')).toBeVisible()
  })

  test('Step 4: Air Ops modal opens and Strike tab shows available squadrons', async ({ page }) => {
    await loadMidway(page)

    const tf16Id = await page.evaluate(() =>
      window.__GAME_STATE__.taskGroups.find(tg => tg.name === 'Task Force 16')?.id ?? null
    )
    await page.evaluate((id) => window.__GAME_ACTIONS__.selectTaskGroup(id!), tf16Id)
    await expect(page.getByTestId('air-ops-btn')).toBeVisible({ timeout: 5_000 })
    await page.getByTestId('air-ops-btn').click()

    // Navigate to Strike tab
    await page.getByRole('tab', { name: 'Strike' }).click()
    await expect(page.getByTestId('air-ops-tab-strike-content')).toBeVisible({ timeout: 5_000 })

    // At least one squadron available before any missions launched
    await expect(page.getByTestId('strike-squadron-row').first()).toBeVisible({ timeout: 5_000 })

    // Launch button disabled until a squadron and target are selected
    await expect(page.getByTestId('launch-strike-btn')).toBeDisabled()
  })

  test('Full golden flow: sighting → select → configure → launch → airborne', async ({ page }) => {
    test.setTimeout(60_000)
    await loadMidway(page)

    // ── Resume at 8× and wait for a confirmed contact ────────────────────────
    await page.getByTestId('hud-time-controls').getByRole('button', { name: '8×' }).click()
    await page.getByTestId('play-pause-btn').click()

    await page.waitForFunction(
      () => window.__GAME_STATE__?.alliedContactCount > 0,
      { timeout: 30_000 }
    )

    // Pause before interacting
    await page.getByTestId('play-pause-btn').click()
    await expect(page.getByTestId('play-pause-btn')).toHaveAttribute('aria-label', /Resume/)

    // ── Select TF-16 ─────────────────────────────────────────────────────────
    const tf16Id = await page.evaluate(() =>
      window.__GAME_STATE__.taskGroups.find(tg => tg.name === 'Task Force 16')?.id ?? null
    )
    expect(tf16Id).not.toBeNull()
    await page.evaluate((id) => window.__GAME_ACTIONS__.selectTaskGroup(id!), tf16Id)

    await expect(page.getByTestId('tg-panel')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('tg-panel')).toContainText('Task Force 16')

    // ── Open Air Ops → Strike tab ─────────────────────────────────────────────
    await page.getByTestId('air-ops-btn').click()
    await page.getByRole('tab', { name: 'Strike' }).click()
    await expect(page.getByTestId('air-ops-tab-strike-content')).toBeVisible({ timeout: 5_000 })

    // ── Select the first available squadron ───────────────────────────────────
    const firstRow = page.getByTestId('strike-squadron-row').first()
    await expect(firstRow).toBeVisible({ timeout: 5_000 })
    await firstRow.click()
    // Row should now show the selection highlight
    await expect(firstRow).toHaveClass(/ring-1/)

    // ── Pick the carrier-group contact (avoids targeting the out-of-range Invasion Force) ──
    const targetSelect = page.getByTestId('strike-target-select')
    await expect(targetSelect).toBeVisible()
    const carrierContactId = await page.evaluate(() => {
      const contacts = window.__GAME_STATE__.contacts
      return contacts.find(c => c.contactType === 'carrier-group')?.id ?? contacts[0]?.id ?? null
    })
    if (carrierContactId) {
      await targetSelect.selectOption({ value: carrierContactId })
    } else {
      await targetSelect.selectOption({ index: 1 })
    }

    // Launch button should now be enabled
    await expect(page.getByTestId('launch-strike-btn')).toBeEnabled({ timeout: 3_000 })

    // ── Launch ────────────────────────────────────────────────────────────────
    // launchStrike() now closes the modal AND resumes if paused — no extra step needed.
    await page.getByTestId('launch-strike-btn').click()

    // ── Verify: strike flight plan becomes airborne within the next step ──────
    await page.waitForFunction(
      () => {
        const plans = window.__GAME_STATE__?.flightPlans ?? []
        return plans.some(fp => fp.mission === 'strike' && fp.status === 'airborne')
      },
      { timeout: 10_000 }
    )

    const airstrikePlan = await page.evaluate(() =>
      window.__GAME_STATE__.flightPlans.find(fp => fp.mission === 'strike' && fp.status === 'airborne')
    )
    expect(airstrikePlan).toBeDefined()
    expect(airstrikePlan!.side).toBe('allied')
    expect(airstrikePlan!.targetHex).toBeDefined()

    // ── Verify: Airborne tab lists the outbound mission ───────────────────────
    // Modal auto-closed on launch — reopen it to inspect the Airborne tab.
    await page.evaluate((id) => window.__GAME_ACTIONS__.selectTaskGroup(id!), tf16Id)
    await page.getByTestId('air-ops-btn').click()
    await page.getByRole('tab', { name: 'Airborne' }).click()
    await expect(page.getByTestId('air-ops-airborne-content')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('air-ops-airborne-content')).toContainText('strike')
    await expect(page.getByTestId('air-ops-airborne-content')).toContainText('airborne')
  })

  test('Extended flow: strike until enemy carrier sunk, verify return and sunk marker', async ({ page }) => {
    // Generous timeout: full mission cycle (launch → strike → return) takes ~25 s at 8×;
    // allow two strike waves plus UI overhead.
    test.setTimeout(120_000)

    await loadMidway(page)

    // ── Set 8× and resume until we have a confirmed IJN contact ──────────────
    await page.getByTestId('hud-time-controls').getByRole('button', { name: '8×' }).click()
    await page.getByTestId('play-pause-btn').click()

    await page.waitForFunction(
      () => window.__GAME_STATE__?.alliedContactCount > 0,
      { timeout: 30_000 }
    )

    // Pause to interact with UI safely
    await page.getByTestId('play-pause-btn').click()
    await expect(page.getByTestId('play-pause-btn')).toHaveAttribute('aria-label', /Resume/)

    // ── Helper: launch ALL available TF-16 squadrons at the first contact ────

    async function launchAllTF16Squadrons() {
      const tf16Id = await page.evaluate(() =>
        window.__GAME_STATE__.taskGroups.find(tg => tg.name === 'Task Force 16')?.id ?? null
      )
      expect(tf16Id).not.toBeNull()

      await page.evaluate((id) => window.__GAME_ACTIONS__.selectTaskGroup(id!), tf16Id)
      await expect(page.getByTestId('air-ops-btn')).toBeVisible({ timeout: 5_000 })
      await page.getByTestId('air-ops-btn').click()
      await page.getByRole('tab', { name: 'Strike' }).click()
      await expect(page.getByTestId('air-ops-tab-strike-content')).toBeVisible({ timeout: 5_000 })

      // Select every available squadron (AirOpsSystem filters out-of-range ones at launch time)
      const rows = await page.getByTestId('strike-squadron-row').all()
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) { await row.click() }

      // Prefer a carrier-group contact so we hit Kido Butai, not the Invasion Force
      const carrierContactId = await page.evaluate(() => {
        const contacts = window.__GAME_STATE__.contacts
        const carrier = contacts.find(c => c.contactType === 'carrier-group')
        return carrier?.id ?? contacts[0]?.id ?? null
      })
      if (carrierContactId) {
        await page.getByTestId('strike-target-select').selectOption({ value: carrierContactId })
      } else {
        await page.getByTestId('strike-target-select').selectOption({ index: 1 })
      }
      await expect(page.getByTestId('launch-strike-btn')).toBeEnabled({ timeout: 3_000 })
      // launchStrike() closes the modal and resumes automatically
      await page.getByTestId('launch-strike-btn').click()

      // Wait until at least one allied strike is airborne
      await page.waitForFunction(
        () => window.__GAME_STATE__?.flightPlans.some(fp => fp.mission === 'strike' && fp.status === 'airborne'),
        { timeout: 10_000 }
      )
    }

    // ── First strike wave via UI ──────────────────────────────────────────────
    await launchAllTF16Squadrons()

    // ── Wait for all allied strike plans to be recovered (mission complete) ───
    await page.waitForFunction(
      () => {
        const plans = window.__GAME_STATE__?.flightPlans ?? []
        const allied = plans.filter(fp => fp.mission === 'strike' && fp.side === 'allied')
        return allied.length > 0 && allied.every(fp => fp.status === 'recovered')
      },
      { timeout: 60_000 }
    )

    // ── If no Japanese carrier sunk yet, fire a second strike via action bridge ──
    const carrierSunkAfterWave1 = await page.evaluate(() =>
      window.__GAME_STATE__.ships.some(s => s.side === 'japanese' && s.status === 'sunk' && s.isCarrier)
    )

    if (!carrierSunkAfterWave1) {
      // Pause, then use the action bridge to issue a direct launch-strike order
      await page.evaluate(() => window.__GAME_ACTIONS__.togglePause())   // pause

      const { sqIds, targetHex } = await page.evaluate(() => {
        const state = window.__GAME_STATE__
        const tf16Id = state.taskGroups.find(tg => tg.name === 'Task Force 16')?.id
        const sqIds = state.squadrons
          .filter(sq => sq.taskGroupId === tf16Id && sq.deckStatus === 'hangared')
          .map(sq => sq.id)
        const targetHex = state.contacts[0]?.lastKnownHex ?? null
        return { sqIds, targetHex }
      })

      if (sqIds.length > 0 && targetHex) {
        await page.evaluate(({ sqIds, targetHex }) => {
          const tf16Id = window.__GAME_STATE__.taskGroups.find(tg => tg.name === 'Task Force 16')?.id
          if (tf16Id) {
            window.__GAME_ACTIONS__.issueOrder({
              type: 'launch-strike',
              taskGroupId: tf16Id,
              squadronIds: sqIds,
              targetHex,
            })
          }
        }, { sqIds, targetHex })
      }

      await page.evaluate(() => window.__GAME_ACTIONS__.togglePause())   // resume

      // Wait for second wave to complete
      await page.waitForFunction(
        () => {
          const plans = window.__GAME_STATE__?.flightPlans ?? []
          const allied = plans.filter(fp => fp.mission === 'strike' && fp.side === 'allied')
          return allied.length > 0 && allied.every(fp => fp.status === 'recovered')
        },
        { timeout: 60_000 }
      )
    }

    // ── Assert: at least one Japanese carrier is sunk ─────────────────────────
    const sunkCarriers = await page.evaluate(() =>
      window.__GAME_STATE__.ships.filter(s => s.side === 'japanese' && s.status === 'sunk' && s.isCarrier)
    )
    expect(sunkCarriers.length).toBeGreaterThan(0)

    // ── Assert: no allied squadrons are still airborne ───────────────────────
    const stillAirborne = await page.evaluate(() =>
      window.__GAME_STATE__.squadrons.filter(sq => sq.side === 'allied' && sq.deckStatus === 'airborne')
    )
    expect(stillAirborne.length).toBe(0)

    // ── Assert: game is running at 8× (auto-speed triggered by useGameEvents) ─
    await page.waitForFunction(
      () => {
        const s = window.__GAME_STATE__
        // Either already at 8× (auto-speed fired) or scenario ended — both are valid
        return s.timeScale === 8 || s.phase === 'ended'
      },
      { timeout: 10_000 }
    )

    // ── Assert: sunk markers are tracked in state and renderer ────────────────
    const sunkMarkers = await page.evaluate(() => window.__GAME_STATE__.sunkMarkers)
    expect(sunkMarkers.length).toBeGreaterThan(0)
    // All markers must carry a valid hex coordinate
    for (const m of sunkMarkers) {
      expect(typeof m.hex.q).toBe('number')
      expect(typeof m.hex.r).toBe('number')
    }
    // At least one sunk marker is on the Japanese side
    expect(sunkMarkers.some(m => m.side === 'japanese')).toBe(true)
  })

})
