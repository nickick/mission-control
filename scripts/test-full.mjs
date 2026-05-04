import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:3000');
await page.waitForTimeout(4000);

// Click zsh-2
await page.click('.terminal-cell:nth-child(2) .terminal-body');
await page.waitForTimeout(500);

// Set command with Cmd+Shift+R
await page.keyboard.press('Meta+Shift+r');
await page.waitForTimeout(500);
await page.keyboard.type('echo hello-from-refresh');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);

// Now refresh with Cmd+R
await page.keyboard.press('Meta+r');
await page.waitForTimeout(3000);

await page.screenshot({ path: '/tmp/mc-full.png' });
await browser.close();
