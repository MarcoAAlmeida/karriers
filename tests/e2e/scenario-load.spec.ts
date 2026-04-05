import { test, expect } from '@playwright/test'

// Type for the __GAME_STATE__ exposed by the dev plugin
interface GameState {
  phase: string
  isPaused: boolean
  currentTime: { day: number; hour: number; minute: number }
  taskGroups: Array<{ id: string; name: string; side: string; position: { q: number; r: number } }>
  ships: Array<{ id: string; name: string; side: string; status: string }>
  squadrons: Array<{ id: string; name: string; side: string; aircraftCount: number }>
  flightPlans: Array<{ id: string; mission: string; status: string }>
  alliedContactCount: number
  sightingLogLength: number
  combatLogLength: number
}

declare global {
  interface Window {
    __GAME_STATE__: GameState
  }
}

test.describe('Scenario load — Battle of Midway', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for scenario select screen to hydrate
    await expect(page.getByTestId('play-btn-midway')).toBeVisible({ timeout: 15_000 })
    // Click Play and wait for the game view + stores to populate
    await page.getByTestId('play-btn-midway').click()
    // Wait for the canvas container (appears once phase changes to 'playing')
    await expect(page.getByTestId('game-canvas')).toBeVisible({ timeout: 15_000 })
    // Wait for __GAME_STATE__ to be available and populated
    await page.waitForFunction(
      () => {
        const s = (window as any).__GAME_STATE__
        return s && s.taskGroups && s.taskGroups.length > 0
      },
      { timeout: 10_000 }
    )
  })

  test('game canvas is rendered with non-zero dimensions', async ({ page }) => {
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 10_000 })

    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })

  test('HUD time controls are visible and show game time', async ({ page }) => {
    const hud = page.getByTestId('hud-time-controls')
    await expect(hud).toBeVisible()
    // Should show day/time text (Mon = day 1, starts at 06:00)
    await expect(hud).toContainText('06:00')
  })

  test('play/pause button is present and starts paused', async ({ page }) => {
    const btn = page.getByTestId('play-pause-btn')
    await expect(btn).toBeVisible()
    // Aria label should indicate "Resume" (game starts paused)
    const label = await btn.getAttribute('aria-label')
    expect(label).toContain('Resume')
  })

  test('__GAME_STATE__ reports playing phase with task groups loaded', async ({ page }) => {
    const state = await page.evaluate(() => window.__GAME_STATE__)
    expect(state.phase).toBe('playing')
    // Battle of Midway has 4 TFs (2 Allied + 2 Japanese)
    expect(state.taskGroups.length).toBeGreaterThanOrEqual(2)
  })

  test('__GAME_STATE__ has both Allied and Japanese task groups', async ({ page }) => {
    const state = await page.evaluate(() => window.__GAME_STATE__)
    const allied = state.taskGroups.filter(tg => tg.side === 'allied')
    const japanese = state.taskGroups.filter(tg => tg.side === 'japanese')
    expect(allied.length).toBeGreaterThanOrEqual(1)
    expect(japanese.length).toBeGreaterThanOrEqual(1)
  })

  test('__GAME_STATE__ has ships with expected fleet size', async ({ page }) => {
    const state = await page.evaluate(() => window.__GAME_STATE__)
    // Midway scenario has 35 ships
    expect(state.ships.length).toBeGreaterThanOrEqual(10)
    expect(state.squadrons.length).toBeGreaterThanOrEqual(10)
  })

  test('game starts paused at Mon 06:00', async ({ page }) => {
    const state = await page.evaluate(() => window.__GAME_STATE__)
    expect(state.isPaused).toBe(true)
    expect(state.currentTime.day).toBe(1)
    expect(state.currentTime.hour).toBe(6)
    expect(state.currentTime.minute).toBe(0)
  })

  test('navigating back to menu resets to scenario screen', async ({ page }) => {
    await page.getByTestId('hud-time-controls').locator('button', { hasText: 'Menu' }).click()
    await expect(page.getByTestId('play-btn-midway')).toBeVisible({ timeout: 5_000 })
  })
})
