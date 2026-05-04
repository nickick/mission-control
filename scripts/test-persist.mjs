import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:3000');
await page.waitForTimeout(4000);

// Click zsh-1
await page.click('.terminal-cell:nth-child(1) .terminal-body');
await page.waitForTimeout(300);

// Set command
await page.keyboard.press('Meta+Shift+r');
await page.waitForTimeout(300);
await page.keyboard.type('echo persisted-test');
await page.waitForTimeout(200);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);

// Refresh to run it
await page.keyboard.press('Meta+r');
await page.waitForTimeout(3000);

await page.screenshot({ path: '/tmp/mc-persist-1.png' });

// Now reload the page and verify command is still there
await page.reload();
await page.waitForTimeout(4000);

// Click zsh-1 again
await page.click('.terminal-cell:nth-child(1) .terminal-body');
await page.waitForTimeout(300);

// Refresh again — should run the same command
await page.keyboard.press('Meta+r');
await page.waitForTimeout(3000);

await page.screenshot({ path: '/tmp/mc-persist-2.png' });
await browser.close();
