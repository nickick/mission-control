import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Clear localStorage and reload
await page.goto('http://localhost:3000');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(3000);

await page.screenshot({ path: '/tmp/mc-zustand-empty.png' });

// Add terminal via +
await page.click('button[title^="Add terminal"]');
await page.waitForTimeout(300);
await page.keyboard.type('echo zustand-works');
await page.waitForTimeout(200);
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);

await page.screenshot({ path: '/tmp/mc-zustand-added.png' });

// Reload and verify persistence
await page.reload();
await page.waitForTimeout(4000);

await page.screenshot({ path: '/tmp/mc-zustand-reloaded.png' });

await browser.close();
