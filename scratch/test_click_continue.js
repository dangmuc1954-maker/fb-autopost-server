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

  // Click tiếp tục
  const btn = await page.$('button:has-text("Tiếp tục"), [role="button"]:has-text("Tiếp tục"), div:has-text("Tiếp tục")');
  if (btn) {
    console.log('Clicking Tiếp tục...');
    await btn.click();
    await new Promise(r => setTimeout(r, 4000));
  }

  console.log('Current URL:', page.url());
  const info = await page.evaluate(() => {
    let uid = '';
    let dtsg = '';
    try {
      if (window.require) {
        const u = window.require('CurrentUserInitialData');
        if (u) uid = u.USER_ID;
        const d = window.require('DTSGInitialData');
        if (d) dtsg = d.token;
      }
    } catch(e) {}
    if (!dtsg) {
      const match = document.documentElement.innerHTML.match(/"DTSGInitialData",\[\],{"token":"([^"]+)"/);
      if (match) dtsg = match[1];
    }
    return { uid, dtsg: dtsg ? dtsg.substring(0, 15) + '...' : null, title: document.title };
  });

  console.log('Result:', info);
  await context.close();
}

test().catch(console.error);
