const { chromium } = require('playwright-core');

(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9224');
    const contexts = browser.contexts();
    let page;
    for (const context of contexts) {
      const pages = context.pages();
      page = pages.find(p => p.url().includes('garfield.local'));
      if (page) break;
    }
    if (!page) { process.exit(1); }

    const results = await page.evaluate(async () => {
      const imgUrl = window.pictureUrl || (document.querySelector('#comic img')?.src);
      let fetchResult = 'N/A';
      if (imgUrl) {
         try {
           const resp = await fetch(imgUrl, { mode: 'no-cors' });
           fetchResult = 'Success (no-cors)';
         } catch (e) {
           fetchResult = 'Fetch failed: ' + e.message;
         }
      }
      return { fetchResult };
    });
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
