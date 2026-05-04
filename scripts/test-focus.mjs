import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));

await page.goto('http://localhost:3000');
await page.waitForTimeout(3000);

// Click first terminal body
const termBody = await page.locator('.terminal-cell:first-child .terminal-body');
await termBody.click();
await page.waitForTimeout(500);

// Check what element is focused
const activeTag = await page.evaluate(() => document.activeElement?.tagName);
const activeClass = await page.evaluate(() => document.activeElement?.className);
console.log('Focused element:', activeTag, activeClass);

// Try typing
await page.keyboard.type('echo hello');
await page.waitForTimeout(1000);

await page.screenshot({ path: '/tmp/mc-focus-test.png' });
await browser.close();
