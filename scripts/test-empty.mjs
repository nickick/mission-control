import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Clear localStorage before loading
await page.goto('http://localhost:3000');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(3000);

await page.screenshot({ path: '/tmp/mc-empty.png' });

// Click the + button to add a terminal
await page.click('button[title^="Add terminal"]');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/mc-empty-modal.png' });

// Fill in command and submit
await page.keyboard.type('ssvs prod-web');
await page.waitForTimeout(200);
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);

await page.screenshot({ path: '/tmp/mc-empty-added.png' });

// Add another with Cmd+Shift+T
await page.keyboard.press('Meta+Shift+t');
await page.waitForTimeout(500);
await page.keyboard.type('ssvs prod-db');
await page.waitForTimeout(200);
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);

await page.screenshot({ path: '/tmp/mc-empty-two.png' });

await browser.close();
