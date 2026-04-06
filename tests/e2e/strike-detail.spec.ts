import { test, expect } from '@playwright/test'

/**
 * Strike Detail E2E
 *
 * Verifies the per-strike detail popup:
 *   - strike-launched event appears in the Engagement Events panel
 *   - clicking the entry opens the StrikeDetailModal
 *   - modal shows mission data (squadron, origin, status)
 *   - simulation is paused while the modal is open
 *   - simulation resumes when the modal is closed
 */

declare global {
  interface Window {
    __GAME_STATE__: {
      phase: string
      isPaused: boolean
      timeScale: number
      currentTime: { day: number; hour: number; minute: number }
      taskGroups: Array<{ id: string; name: string; side: string }>
      squadrons: Array<{ id: string; name: string; side: string; deckStatus: string; taskGroupId: string }>
      contacts: Array<{ id: string; lastKnownHex: { q: number; r: number }; contactType: string }>
      combatLogLength: number
      alliedContactCount: number
    }
    __GAME_ACTIONS__: {
      selectTaskGroup: (id: string) => void
      issueOrder: (payload: unknown) => void
      togglePause: () => void
    }
  }
}

async function loadMidway(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.getByTestId('play-btn-midway')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('play-btn-midway').click()
  await expect(page.getByTestId('game-canvas')).toBeVisible({ timeout: 15_000 })
  await page.waitForFunction(
    () => window.__GAME_STATE__?.taskGroups?.length > 0,
    { timeout: 10_000 }
  )
}

test.describe('Strike Detail Popup', () => {

  test('strike-launched entry appears in events panel and opens detail modal', async ({ page }) => {
    test.setTimeout(60_000)
    await loadMidway(page)

    // ── Open the events panel ──────────────────────────────────────────────
    await page.getByTestId('events-panel-toggle').click()
    await expect(page.getByTestId('events-panel-body')).toBeVisible({ timeout: 3_000 })

    // ── Run briefly at 8× to get a confirmed contact ───────────────────────
    await page.getByTestId('hud-time-controls').getByRole('button', { name: '8×' }).click()
    await page.getByTestId('play-pause-btn').click()
    await page.waitForFunction(
      () => window.__GAME_STATE__?.alliedContactCount > 0,
      { timeout: 30_000 }
    )
    await page.getByTestId('play-pause-btn').click()  // pause
    await expect(page.getByTestId('play-pause-btn')).toHaveAttribute('aria-label', /Resume/)

    // ── Issue a launch-strike order via action bridge ──────────────────────
    const launched = await page.evaluate(() => {
      const state = window.__GAME_STATE__
      const tf16 = state.taskGroups.find(tg => tg.name === 'Task Force 16')
      if (!tf16) return false
      const sq = state.squadrons.find(
        sq => sq.taskGroupId === tf16.id && sq.deckStatus === 'hangared'
      )
      const contact = state.contacts[0]
      if (!sq || !contact) return false
      window.__GAME_ACTIONS__.issueOrder({
        type: 'launch-strike',
        taskGroupId: tf16.id,
        squadronIds: [sq.id],
        targetHex: contact.lastKnownHex,
      })
      return true
    })
    expect(launched).toBe(true)

    // ── Resume one step so strike-launched event fires ─────────────────────
    const initialLogLength = await page.evaluate(() => window.__GAME_STATE__.combatLogLength)
    await page.getByTestId('play-pause-btn').click()  // resume
    await page.waitForFunction(
      (prev) => window.__GAME_STATE__.combatLogLength > prev,
      initialLogLength,
      { timeout: 15_000 }
    )
    await page.getByTestId('play-pause-btn').click()  // pause again

    // ── Strike entry should appear in the events panel ─────────────────────
    const strikeEntry = page.getByTestId('strike-entry').first()
    await expect(strikeEntry).toBeVisible({ timeout: 5_000 })

    // ── Click to open the detail modal ────────────────────────────────────
    await strikeEntry.click()
    const modal = page.getByTestId('strike-detail-modal')
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // ── Modal contains mission data ────────────────────────────────────────
    await expect(modal).toContainText('strike')          // mission badge
    await expect(modal).toContainText('Task Force 16')   // origin carrier
  })

  test('modal pauses simulation on open and resumes on close', async ({ page }) => {
    test.setTimeout(60_000)
    await loadMidway(page)

    // Open events panel and run to get a contact + launch
    await page.getByTestId('events-panel-toggle').click()
    await page.getByTestId('hud-time-controls').getByRole('button', { name: '8×' }).click()
    await page.getByTestId('play-pause-btn').click()
    await page.waitForFunction(
      () => window.__GAME_STATE__?.alliedContactCount > 0,
      { timeout: 30_000 }
    )
    await page.getByTestId('play-pause-btn').click()

    const launched = await page.evaluate(() => {
      const state = window.__GAME_STATE__
      const tf16 = state.taskGroups.find(tg => tg.name === 'Task Force 16')
      if (!tf16) return false
      const sq = state.squadrons.find(
        sq => sq.taskGroupId === tf16.id && sq.deckStatus === 'hangared'
      )
      const contact = state.contacts[0]
      if (!sq || !contact) return false
      window.__GAME_ACTIONS__.issueOrder({
        type: 'launch-strike',
        taskGroupId: tf16.id,
        squadronIds: [sq.id],
        targetHex: contact.lastKnownHex,
      })
      return true
    })
    expect(launched).toBe(true)

    const initialLogLength = await page.evaluate(() => window.__GAME_STATE__.combatLogLength)
    // Resume just long enough to fire the step
    await page.getByTestId('play-pause-btn').click()
    await page.waitForFunction(
      (prev) => window.__GAME_STATE__.combatLogLength > prev,
      initialLogLength,
      { timeout: 15_000 }
    )
    // Leave it running (not paused) before opening the modal
    const isRunning = await page.evaluate(() => !window.__GAME_STATE__.isPaused)
    expect(isRunning).toBe(true)

    // ── Open modal while game is running — should auto-pause ──────────────
    const strikeEntry = page.getByTestId('strike-entry').first()
    await expect(strikeEntry).toBeVisible({ timeout: 5_000 })
    await strikeEntry.click()
    await expect(page.getByTestId('strike-detail-modal')).toBeVisible({ timeout: 5_000 })

    const pausedOnOpen = await page.evaluate(() => window.__GAME_STATE__.isPaused)
    expect(pausedOnOpen).toBe(true)

    // ── Close the modal via Escape — should auto-resume ───────────────────
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('strike-detail-modal')).not.toBeVisible({ timeout: 3_000 })

    const resumedOnClose = await page.evaluate(() => !window.__GAME_STATE__.isPaused)
    expect(resumedOnClose).toBe(true)
  })

})
