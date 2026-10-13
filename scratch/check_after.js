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
  await new Promise(r => setTimeout(r, 2000));

  const continueBtn = await page.$('div[role="button"]:has-text("Tiếp tục"), button:has-text("Tiếp tục")');
  if (continueBtn) {
    console.log('Clicking continue button...');
    await continueBtn.click();
    await new Promise(r => setTimeout(r, 5000));
  }

  await page.screenshot({ path: path.join(__dirname, 'screen_after_click.png') });
  const html = await page.content();
  console.log('Has password field?', html.includes('type="password"'));
  console.log('Dialog visible?', html.includes('role="dialog"'));
  console.log('Current URL:', page.url());
  await context.close();
}

test().catch(console.error);
