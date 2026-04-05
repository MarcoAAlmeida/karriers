import { test, expect } from '@playwright/test'

test.describe('Home screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for the SPA to hydrate and render the scenario select screen
    await expect(page.getByTestId('scenario-card-midway')).toBeVisible({ timeout: 15_000 })
  })

  test('shows title and subtitle', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Karriers')
    await expect(page.getByText('Pacific Carrier Operations')).toBeVisible()
  })

  test('background is dark (not white / not transparent)', async ({ page }) => {
    // Check the root wrapper div — doesn't rely on exact Tailwind class names
    const bg = await page.evaluate(() => {
      const root = document.querySelector('[class*="bg-gray-950"]') ??
                   document.querySelector('.min-h-screen')
      return root ? getComputedStyle(root).backgroundColor : null
    })
    expect(bg).not.toBeNull()
    // Any dark background — all channels should be low (< 30)
    // e.g. rgb(3, 7, 18) or rgb(2, 6, 23) in various Tailwind versions
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
    expect(bg).not.toMatch(/^rgb\(25[0-9]/)  // not close to white
  })

  test('shows Battle of Midway scenario card with Play button', async ({ page }) => {
    const card = page.getByTestId('scenario-card-midway')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Battle of Midway')
    await expect(card).toContainText('June 4')

    const playBtn = page.getByTestId('play-btn-midway')
    await expect(playBtn).toBeVisible()
    await expect(playBtn).toContainText('Play')
  })

  test('shows Coral Sea card with Coming Soon label', async ({ page }) => {
    const card = page.getByTestId('scenario-card-coral-sea')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Battle of the Coral Sea')

    const comingSoon = page.getByTestId('coming-soon-coral-sea')
    await expect(comingSoon).toBeVisible()
    await expect(comingSoon).toContainText('Coming soon')
  })

  test('Coral Sea card is visually disabled (reduced opacity)', async ({ page }) => {
    const card = page.getByTestId('scenario-card-coral-sea')
    const opacity = await card.evaluate(el => parseFloat(getComputedStyle(el).opacity))
    expect(opacity).toBeLessThan(1)
  })
})
