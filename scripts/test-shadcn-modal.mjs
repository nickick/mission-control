import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:3000');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(3000);

await page.click('button[title^="Add terminal"]');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/mc-shadcn-modal.png' });

await page.keyboard.type('echo shadcn-test');
await page.waitForTimeout(200);
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);

await page.screenshot({ path: '/tmp/mc-shadcn-running.png' });

await browser.close();
