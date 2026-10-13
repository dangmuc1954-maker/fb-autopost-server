const { chromium } = require('playwright-core');
const path = require('path');

async function test() {
  const profileDir = path.resolve(__dirname, '..', 'browser_profiles', 'prof_demo_01');
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await context.newPage();
  await page.goto('https://www.facebook.com', { waitUntil: 'networkidle', timeout: 35000 }).catch(() => {});
  
  const found = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script')).map(s => s.innerText);
    const results = [];
    for (const s of scripts) {
      if (s.includes('ComposerStoryCreateMutation') || s.includes('ComposerStoryCreate')) {
        const matches = s.matchAll(/"(\d{10,20})"/g);
        for (const m of matches) {
          results.push(m[1]);
        }
      }
    }
    return { count: scripts.length, matches: results.slice(0, 10) };
  });

  console.log('Found:', found);
  await context.close();
}

test().catch(console.error);
