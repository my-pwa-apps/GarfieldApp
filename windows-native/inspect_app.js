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

    if (!page) {
      console.error('Could not find garfield.local page. Pages found: ' + 
        contexts.flatMap(c => c.pages()).map(p => p.url()).join(', '));
      process.exit(1);
    }

    await page.waitForSelector('#comic', { timeout: 10000 });

    const results = await page.evaluate(async () => {
      const canShareFiles = typeof navigator.canShare === 'function' ? 
        navigator.canShare({ files: [new File([new Blob(['x'], { type: 'image/jpeg' })], 'x.jpg', { type: 'image/jpeg' })] }) : 
        'N/A';
      
      let fetchResult = 'N/A';
      const imgUrl = window.pictureUrl || (document.querySelector('#comic img')?.src);
      if (imgUrl) {
        try {
          const resp = await fetch(imgUrl);
          fetchResult = {
            status: resp.status,
            contentType: resp.headers.get('content-type')
          };
        } catch (e) {
          fetchResult = 'Error: ' + e.message;
        }
      }

      return {
        href: location.href,
        shareType: typeof navigator.share,
        canShareType: typeof navigator.canShare,
        canShareFiles,
        pictureUrl: imgUrl,
        fetchResult
      };
    });

    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
