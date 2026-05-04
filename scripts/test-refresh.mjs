import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:3000');
await page.waitForTimeout(3000);

// zsh-2 should already have "ssvs molt-0" set from previous test
// Click it and press Cmd+R to refresh
await page.click('.terminal-cell:nth-child(2) .terminal-body');
await page.waitForTimeout(300);

await page.keyboard.press('Meta+r');
await page.waitForTimeout(2000);

await page.screenshot({ path: '/tmp/mc-refresh.png' });
await browser.close();
