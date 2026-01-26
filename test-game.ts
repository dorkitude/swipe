import { chromium } from 'playwright';

async function testGame() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect errors
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`Console: ${msg.text()}`);
      console.log('❌ Console error:', msg.text());
    }
  });

  page.on('pageerror', (err) => {
    errors.push(`Page: ${err.message}`);
    console.log('❌ Page error:', err.message);
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure();
    console.log('❌ Request failed:', request.url(), failure?.errorText);
  });

  page.on('response', (response) => {
    if (response.status() >= 400) {
      console.log(`⚠️  ${response.status()} ${response.url()}`);
    }
  });

  try {
    console.log('🔄 Loading login page...');
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    console.log('✅ Login page loaded');

    // Click "Play as Guest"
    console.log('🔄 Clicking Play as Guest...');
    await page.click('button:has-text("Play as Guest")');
    await page.waitForURL('**/lobby');
    console.log('✅ Lobby loaded');

    // Click Easy difficulty
    console.log('🔄 Starting Easy game...');
    await page.click('button:has-text("Easy")');
    await page.waitForURL('**/game');
    console.log('✅ Game page loaded');

    // Wait for game to connect and start
    console.log('🔄 Waiting for game to start...');
    await page.waitForTimeout(2000);

    // Wait for letters to appear (means game is playing)
    for (let i = 0; i < 10; i++) {
      const letters = await page.$$('[class*="letterTile"]');
      if (letters.length > 0) {
        console.log('✅ Game is playing!');
        break;
      }
      await page.waitForTimeout(500);
    }

    // Check if letters are visible
    const letters = await page.$$('[class*="letterTile"]');
    console.log(`📊 Letters visible: ${letters.length}`);

    // Check if players are visible
    const players = await page.$$('[class*="playerCard"]');
    console.log(`📊 Players visible: ${players.length}`);

    // Try typing a word
    const input = await page.$('input');
    if (input) {
      await input.fill('TEST');
      console.log('📝 Typed: TEST');

      // Submit
      await page.click('button:has-text("Submit")');
      await page.waitForTimeout(1000);
    }

    // Check URL has roomId
    const url = page.url();
    console.log('📊 URL:', url);
    if (url.includes('roomId=')) {
      console.log('✅ URL has roomId for rejoin!');
    }

    // Summary
    if (errors.filter(e => !e.includes('404') && !e.includes('auth/me')).length > 0) {
      console.log('\n❌ Significant errors:');
      errors.forEach((e) => console.log(`  - ${e}`));
    } else {
      console.log('\n✅ Game working! No critical errors.');
    }

  } catch (err) {
    console.log('❌ Test failed:', err);
  }

  console.log('\n👀 Inspect the browser. Ctrl+C to close.');
  await page.waitForTimeout(30000);
  await browser.close();
}

testGame().catch(console.error);
