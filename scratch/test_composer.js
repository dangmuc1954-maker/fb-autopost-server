const { chromium } = require('playwright-core');
const path = require('path');

async function testGroupComposer() {
  const profileDir = path.resolve(__dirname, '..', 'browser_profiles', 'prof_demo_01');
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await context.newPage();
  const groupUrl = 'https://www.facebook.com/groups/1450430758632402';
  console.log('Navigating to:', groupUrl);
  await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);

  const composerInfo = await page.evaluate(() => {
    const results = [];
    
    // Look for all elements that contain text related to writing / creating post
    const allElements = Array.from(document.querySelectorAll('*'));
    for (const el of allElements) {
      if (el.children.length === 0) { // leaf text node
        const text = (el.innerText || '').trim();
        if (
          text.includes('Viết gì đó') || 
          text.includes('Bạn viết gì đi') || 
          text.includes('Tạo bài viết') ||
          text.includes('Write something') ||
          text.includes('Create post') ||
          text.includes('bài viết công khai')
        ) {
          // get clickable ancestor
          let clickable = el;
          while (clickable && clickable !== document.body && clickable.getAttribute('role') !== 'button' && clickable.tagName !== 'BUTTON') {
            clickable = clickable.parentElement;
          }
          results.push({
            text,
            tag: el.tagName,
            clickableRole: clickable ? clickable.getAttribute('role') : null,
            clickableTag: clickable ? clickable.tagName : null,
            ariaLabel: clickable ? clickable.getAttribute('aria-label') : null,
            parentPagelet: el.closest('[data-pagelet]') ? el.closest('[data-pagelet]').getAttribute('data-pagelet') : null
          });
        }
      }
    }

    // Also check for any contenteditable textbox already on the page
    const textboxes = Array.from(document.querySelectorAll('div[contenteditable="true"], div[role="textbox"]')).map(tb => ({
      role: tb.getAttribute('role'),
      ariaLabel: tb.getAttribute('aria-label'),
      placeholder: tb.getAttribute('aria-placeholder'),
      visible: tb.offsetWidth > 0 && tb.offsetHeight > 0
    }));

    return { results, textboxes, title: document.title };
  });

  console.log('Composer info:', JSON.stringify(composerInfo, null, 2));
  await context.close();
}

testGroupComposer().catch(e => console.error(e));
