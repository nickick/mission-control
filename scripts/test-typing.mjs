import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000');
await page.waitForTimeout(3000);

// Click first terminal to focus it
await page.click('.terminal-cell:first-child .terminal-body');
await page.waitForTimeout(500);

// Type something
await page.keyboard.type('echo hello');
await page.waitForTimeout(1000);

// Press enter
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);

await page.screenshot({ path: '/tmp/mc-typing.png' });
await browser.close();
console.log('Screenshot saved to /tmp/mc-typing.png');
