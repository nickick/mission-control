import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.addInitScript(() => {
    localStorage.setItem(
      "mission-control:config",
      JSON.stringify({
        state: {
          pages: [
            {
              id: "space-test-page",
              name: "Space Test",
              terminals: [
                {
                  id: `space-test-${Date.now()}`,
                  name: "space-test",
                  shell: "/bin/zsh",
                },
              ],
            },
          ],
          repoRoots: {},
        },
        version: 0,
      })
    );
  });

  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".terminal-body", { timeout: 15000 });

  const terminalBody = page.locator(".terminal-body").first();
  const terminalMount = page.locator(".terminal-mount").first();
  await terminalMount.click();

  await terminalBody.evaluate((node) => {
    node.scrollTop = 0;
  });

  const before = await terminalBody.evaluate((node) => node.scrollTop);
  await page.keyboard.type("x y");
  await page.waitForTimeout(250);
  const after = await terminalBody.evaluate((node) => node.scrollTop);
  const text = await page.locator(".xterm-rows").first().evaluate((node) => node.textContent ?? "");

  console.log(JSON.stringify({
    before,
    after,
    hasTypedSpace: text.includes("x y"),
    hasDoubleTyped: text.includes("xx  yy"),
    tail: text.slice(-200),
  }));
} finally {
  await browser.close();
}
