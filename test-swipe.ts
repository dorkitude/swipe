import { chromium } from 'playwright';

/**
 * Test swipe functionality with deterministic letters.
 *
 * Test case: GEEK → GEEKIER
 * - Pool starts with: G, E, E, K, I, E, R (+ 3 more random)
 * - Player claims "GEEK" (uses G, E, E, K)
 * - Pool refills with I, E, R visible
 * - Player types "GEEKIER" - should swipe GEEK + I, E, R
 */
async function testSwipe() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect errors
  const errors: string[] = [];

  page.on('console', (msg) => {
    const text = msg.text();
    console.log(`[Browser] ${text}`);
    if (msg.type() === 'error') {
      errors.push(text);
    }
  });

  page.on('pageerror', (err) => {
    errors.push(`Page: ${err.message}`);
    console.log('❌ Page error:', err.message);
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

    // Navigate directly to game with deterministic test letters
    // GEEK needs: G, E, E, K (4 letters)
    // After claiming GEEK, we need I, E, R in pool to make GEEKIER
    // So initial pool should be: G, E, E, K, I, E, R, X, Y, Z (10 letters)
    const testLetters = 'GEEKIERXYZ';

    console.log('🔄 Starting game with test letters...');
    // Navigate directly to game with testLetters and AI opponent
    await page.goto(`http://localhost:5173/game?testLetters=${testLetters}&ai=easy`);
    await page.waitForLoadState('networkidle');
    console.log('✅ Game page loaded');

    // Wait for game to start
    await page.waitForTimeout(2000);

    // Check letters
    const letterTiles = await page.$$('[class*="letterTile"]');
    const letters: string[] = [];
    for (const tile of letterTiles) {
      const char = await tile.$eval('[class*="letterChar"]', el => el.textContent);
      letters.push(char || '?');
    }
    console.log('📊 Pool letters:', letters.join(', '));

    // First, let's claim a word from the pool
    const input = await page.$('input');
    if (!input) {
      console.log('❌ Input not found');
      return;
    }

    // Type GEEK and submit
    console.log('📝 Claiming GEEK...');
    await input.fill('GEEK');
    await page.click('button:has-text("Submit")');
    await page.waitForTimeout(1500);

    // Check if GEEK was claimed
    const playerWords = await page.$$('[class*="wordTag"]');
    const words: string[] = [];
    for (const tag of playerWords) {
      const word = await tag.textContent();
      words.push(word || '?');
    }
    console.log('📊 Claimed words:', words.join(', '));

    if (!words.includes('GEEK')) {
      console.log('❌ Failed to claim GEEK');
      // Check for error message
      const feedback = await page.$('[class*="feedbackMessage"]');
      if (feedback) {
        const text = await feedback.textContent();
        console.log('📊 Feedback:', text);
      }
    } else {
      console.log('✅ GEEK claimed!');
    }

    // Wait for letters to refill
    await page.waitForTimeout(4000);

    // Check letters again
    const letterTiles2 = await page.$$('[class*="letterTile"]');
    const letters2: string[] = [];
    for (const tile of letterTiles2) {
      const char = await tile.$eval('[class*="letterChar"]', el => el.textContent);
      letters2.push(char || '?');
    }
    console.log('📊 Pool letters after refill:', letters2.join(', '));

    // Now try to swipe GEEK → GEEKIER
    console.log('📝 Attempting swipe: GEEK → GEEKIER...');
    await input.fill('GEEKIER');
    await page.click('button:has-text("Submit")');
    await page.waitForTimeout(2000);

    // Check result
    const playerWords2 = await page.$$('[class*="wordTag"]');
    const words2: string[] = [];
    for (const tag of playerWords2) {
      const word = await tag.textContent();
      words2.push(word || '?');
    }
    console.log('📊 Words after swipe attempt:', words2.join(', '));

    if (words2.includes('GEEKIER') && !words2.includes('GEEK')) {
      console.log('✅ SWIPE SUCCESS! GEEK → GEEKIER');
    } else if (words2.includes('GEEK')) {
      console.log('❌ SWIPE FAILED: GEEK still there');
      const feedback = await page.$('[class*="feedbackMessage"]');
      if (feedback) {
        const text = await feedback.textContent();
        console.log('📊 Feedback:', text);
      }
    }

    // Summary
    console.log('\n📊 Test Summary:');
    if (errors.filter(e => !e.includes('404') && !e.includes('auth')).length > 0) {
      console.log('❌ Errors occurred:');
      errors.forEach((e) => console.log(`  - ${e}`));
    }

  } catch (err) {
    console.log('❌ Test failed:', err);
  }

  console.log('\n👀 Inspect the browser. Ctrl+C to close.');
  await page.waitForTimeout(60000);
  await browser.close();
}

testSwipe().catch(console.error);
