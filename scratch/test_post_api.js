const { chromium } = require('playwright-core');
const path = require('path');

async function test() {
  const profileDir = path.resolve(__dirname, '..', 'browser_profiles', 'prof_demo_01');
  console.log('Testing profile:', profileDir);
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await context.newPage();
  await page.goto('https://www.facebook.com/groups/1450430758632402', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await new Promise(r => setTimeout(r, 4000));

  const info = await page.evaluate(async () => {
    let dtsg = '';
    let uid = '';
    try {
      if (window.require) {
        const d = window.require('DTSGInitialData');
        if (d) dtsg = d.token;
        const u = window.require('CurrentUserInitialData');
        if (u) uid = u.USER_ID;
      }
    } catch(e) {}

    if (!dtsg) {
      const input = document.querySelector('input[name="fb_dtsg"]');
      if (input) dtsg = input.value;
    }

    if (!dtsg) {
      const match = document.documentElement.innerHTML.match(/"DTSGInitialData",\[\],{"token":"([^"]+)"/);
      if (match) dtsg = match[1];
    }

    // Check Relay / GraphQL doc_ids
    const docIds = {};
    const scripts = Array.from(document.querySelectorAll('script')).map(s => s.innerText);
    for (const s of scripts) {
      const m = s.matchAll(/"([a-zA-Z0-9_]*Composer[a-zA-Z0-9_]*Mutation)":\{"query_params":\{.*?"id":"(\d+)"/g);
      for (const match of m) {
        docIds[match[1]] = match[2];
      }
      const m2 = s.matchAll(/"name":"([a-zA-Z0-9_]*Composer[a-zA-Z0-9_]*)"[^{}]*?"id":"(\d+)"/g);
      for (const match of m2) {
        docIds[match[1]] = match[2];
      }
    }

    return { uid, dtsg: dtsg ? (dtsg.substring(0, 15) + '...') : null, docIds, title: document.title };
  });

  console.log('Result:', info);
  await context.close();
}

test().catch(console.error);
