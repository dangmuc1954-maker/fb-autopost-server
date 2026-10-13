const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

async function test() {
  const profileDir = path.resolve(__dirname, '..', 'browser_profiles', 'prof_demo_01');
  console.log('Testing profile:', profileDir);
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await context.newPage();
  await page.goto('https://www.facebook.com/me', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await new Promise(r => setTimeout(r, 4000));
  
  const info = await page.evaluate(() => {
    let name = '';
    let uid = '';
    let avatar = '';

    // 1. CurrentUserInitialData
    try {
      if (window.require) {
        const u = window.require('CurrentUserInitialData');
        if (u) {
          name = u.NAME || '';
          uid = u.USER_ID || '';
          if (u.PROFILE_PIC_URL) avatar = u.PROFILE_PIC_URL;
        }
      }
    } catch(e) {}

    // 2. Search scripts
    if (!name || !avatar) {
      const scripts = Array.from(document.querySelectorAll('script')).map(s => s.innerText);
      for (const s of scripts) {
        if (!name) {
          const mName = s.match(/"NAME":"([^"]+)"/);
          if (mName) name = mName[1];
        }
        if (!avatar) {
          const mPic = s.match(/"PROFILE_PIC_URL":"([^"]+)"/);
          if (mPic) avatar = mPic[1].replace(/\\/g, '');
        }
      }
    }

    // 3. Search DOM on profile page
    if (!name) {
      const h1 = document.querySelector('h1');
      if (h1 && h1.innerText) name = h1.innerText.trim();
    }

    // 4. Search DOM for avatar (large profile pic)
    if (!avatar) {
      const imgs = Array.from(document.querySelectorAll('svg image, image, img'));
      for (const img of imgs) {
        const src = img.getAttribute('xlink:href') || img.getAttribute('href') || img.src || '';
        if (src.includes('scontent') && (src.includes('p320x320') || src.includes('s320x320') || src.includes('p160x160') || src.includes('dst-jpg'))) {
          avatar = src;
          break;
        }
      }
      if (!avatar) {
        for (const img of imgs) {
          const src = img.getAttribute('xlink:href') || img.getAttribute('href') || img.src || '';
          if (src.includes('scontent') && (src.includes('fbcdn.net'))) {
            avatar = src;
            break;
          }
        }
      }
    }

    return { name, uid, avatar, title: document.title, url: window.location.href };
  });

  console.log('Result:', JSON.stringify(info, null, 2));
  await context.close();
}

test().catch(e => console.error(e));
