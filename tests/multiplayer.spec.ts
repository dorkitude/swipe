import { test, expect, chromium, type Page } from '@playwright/test';

/**
 * Test that two guests can join the same room by code
 */
test('two guests can join the same room by code', async () => {
  const browser = await chromium.launch();

  // Create two separate browser contexts (separate sessions)
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    // Player 1: Login as guest
    await page1.goto('http://localhost:5173');
    await page1.click('button:has-text("Play as Guest")');
    await page1.waitForURL('**/lobby');
    console.log('Player 1: Logged in as guest');

    // Player 1: Create a private room
    await page1.click('button:has-text("Create Room")');
    await page1.waitForURL('**/game');
    console.log('Player 1: Created room');

    // Wait for room code to appear
    await page1.waitForSelector('[class*="codeValue"]', { timeout: 10000 });
    const roomCode = await page1.textContent('[class*="codeValue"]');
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);
    console.log(`Player 1: Room code is ${roomCode}`);

    // Player 2: Login as guest
    await page2.goto('http://localhost:5173');
    await page2.click('button:has-text("Play as Guest")');
    await page2.waitForURL('**/lobby');
    console.log('Player 2: Logged in as guest');

    // Player 2: Join by room code
    await page2.fill('input[placeholder="ABC123"]', roomCode!);
    await page2.click('button:has-text("Join")');
    await page2.waitForURL('**/game**', { timeout: 10000 });
    console.log('Player 2: Joined room');

    // Wait for game to start (2 players triggers auto-start)
    // Both players should see the game phase change to 'playing'
    await page1.waitForSelector('[class*="letterTile"]', { timeout: 10000 });
    await page2.waitForSelector('[class*="letterTile"]', { timeout: 10000 });
    console.log('Game started - letters visible');

    // Verify both players see 2 player sections
    const players1 = await page1.$$('[class*="playerWordSection"]');
    const players2 = await page2.$$('[class*="playerWordSection"]');

    expect(players1.length).toBe(2);
    expect(players2.length).toBe(2);
    console.log('Both players see 2 player sections');

    // Verify both pages show the same room code
    const roomCode1 = await page1.textContent('[class*="codeValue"]');
    const roomCode2 = await page2.textContent('[class*="codeValue"]');
    expect(roomCode1).toBe(roomCode2);
    console.log('Room codes match on both pages');

  } finally {
    await context1.close();
    await context2.close();
    await browser.close();
  }
});

/**
 * Test that joining with an invalid code shows an error
 */
test('invalid room code shows error', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.click('button:has-text("Play as Guest")');
  await page.waitForURL('**/lobby');

  // Enter an invalid room code
  await page.fill('input[placeholder="ABC123"]', 'ZZZZZ9');
  await page.click('button:has-text("Join")');

  // Should show error message
  await page.waitForSelector('[class*="error"]', { timeout: 5000 });
  const errorText = await page.textContent('[class*="error"]');
  expect(errorText).toContain('Room not found');
});
