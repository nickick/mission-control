import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:3000');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(3000);

await page.screenshot({ path: '/tmp/mc-shadcn-empty.png' });

// Open new terminal modal
await page.click('button[title^="Add terminal"]');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/mc-shadcn-modal.png' });

await browser.close();
