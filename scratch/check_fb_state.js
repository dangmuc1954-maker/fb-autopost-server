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
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await new Promise(r => setTimeout(r, 3000));

  await page.screenshot({ path: path.join(__dirname, 'screen_check.png') });
  
  const state = await page.evaluate(() => {
    return {
      buttons: Array.from(document.querySelectorAll('button, div[role="button"], a')).map(b => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 30),
      inputs: Array.from(document.querySelectorAll('input')).map(i => ({ name: i.name, type: i.type, placeholder: i.placeholder, val: !!i.value }))
    };
  });
  console.log('State:', state);
  await context.close();
}

test().catch(console.error);
