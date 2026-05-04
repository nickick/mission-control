import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));

await page.goto('http://localhost:3000');
await page.waitForTimeout(3000);

// Click second terminal
await page.click('.terminal-cell:nth-child(2) .terminal-body');
await page.waitForTimeout(300);

// Press Cmd+Shift+R to open set-command modal
await page.keyboard.press('Meta+Shift+r');
await page.waitForTimeout(500);

await page.screenshot({ path: '/tmp/mc-setcmd-modal.png' });

// Type a command
await page.keyboard.type('ssvs molt-0');
await page.waitForTimeout(300);

// Submit
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);

await page.screenshot({ path: '/tmp/mc-setcmd-done.png' });
await browser.close();
