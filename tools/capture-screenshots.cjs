const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const sharp = require('sharp');

const baseURL = process.argv[2] || 'http://127.0.0.1:8000/';
const comicDate = process.argv[3] || '2026-09-12';
const outputDirectory = path.resolve(__dirname, '../screenshots');
const captures = [
  { name: 'garfield-desktop.webp', width: 1280, height: 800, scale: 1 },
  { name: 'garfield-mobile.webp', width: 390, height: 844, scale: 2, mobile: true },
  { name: 'garfield-social.png', width: 1600, height: 840, scale: 0.75 }
];

async function writeScreenshot(png, filename) {
  const useWebp = filename.endsWith('.webp');
  const image = useWebp ? await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer() : png;
  if (useWebp && image.length >= png.length) throw new Error(`${filename}: WebP is not smaller than PNG`);
  if (image.length > 600 * 1024) throw new Error(`${filename}: exceeds the 600 KiB screenshot budget`);
  await writeFile(filename, image);
  return image.length;
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const capture of captures) {
      const context = await browser.newContext({
        viewport: { width: capture.width, height: capture.height },
        deviceScaleFactor: capture.scale,
        isMobile: !!capture.mobile,
        hasTouch: !!capture.mobile,
        locale: 'en-US',
        colorScheme: 'light',
        serviceWorkers: 'block'
      });
      try {
        await context.addInitScript(() => {
          Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#favheart')).toBeEnabled({ timeout: 20000 });
        await page.locator('#DatePicker').fill(comicDate);
        await page.locator('#DatePicker').dispatchEvent('change');
        const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          .format(new Date(`${comicDate}T12:00:00`));
        await expect(page.locator('#comic')).toHaveAttribute('alt', `Garfield for ${dateLabel} (English)`, { timeout: 20000 });
        await expect(page.locator('#comic')).toHaveCSS('opacity', '1');
        await expect(page.locator('#favheart')).toBeEnabled({ timeout: 20000 });
        await expect(page.locator('#DatePicker')).toHaveValue(comicDate);
        await expect(page.locator('#comic-message')).not.toBeVisible();
        await expect(page.locator('#comic')).toBeVisible();
        await page.evaluate(async () => {
          await document.fonts.ready;
          await document.getElementById('comic').decode();
        });
        const bounds = await page.locator('#comic').boundingBox();
        const heart = await page.locator('#favheart').boundingBox();
        if (!bounds || bounds.width < 100 || bounds.y < 0 || bounds.y + bounds.height > capture.height ||
            !heart || heart.y + heart.height > capture.height ||
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
          throw new Error(`${capture.name}: comic or controls do not fit the viewport`);
        }
        if (errors.length) throw new Error(errors.join('\n'));
        await page.mouse.move(0, capture.height - 1);
        const filename = path.join(outputDirectory, capture.name);
        const png = await page.screenshot({ type: 'png', animations: 'disabled', fullPage: false });
        const bytes = await writeScreenshot(png, filename);
        console.log(`${capture.name}: ${capture.width * capture.scale}x${capture.height * capture.scale}, ${Math.round(bytes / 1024)} KiB, comic ${comicDate}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

module.exports = { writeScreenshot };
if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}