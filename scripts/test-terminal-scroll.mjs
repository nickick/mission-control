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
              id: "scroll-test-page",
              name: "Scroll Test",
              terminals: [
                {
                  id: `scroll-test-${Date.now()}`,
                  name: "scroll-test",
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
  await page.waitForTimeout(2000);

  const measure = () =>
    terminalBody.evaluate((node) => ({
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
      scrollTop: node.scrollTop,
      domRows: node.querySelectorAll(".xterm-rows > div").length,
    }));

  const before = await measure();

  // Produce more output than fits in the visible cell.
  await page.keyboard.type("seq 100");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);

  const after = await measure();
  const textAfterSeq = await page
    .locator(".xterm-rows")
    .first()
    .evaluate((node) => node.textContent ?? "");
  const pinnedToBottom =
    Math.abs(after.scrollTop - (after.scrollHeight - after.clientHeight)) <= 6;

  // Browser-native wheel scroll upward should move the scroll position.
  await terminalBody.hover();
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);
  const afterWheel = await measure();
  const wheelScrolledUp = afterWheel.scrollTop < after.scrollTop - 100;

  // Output written while scrolled up must NOT yank the view to the bottom.
  await page.keyboard.type("echo stay");
  await page.waitForTimeout(400);
  const afterTypeScrolledUp = await measure();

  // Scroll back down, clear, and the scroll area should shrink to the cell.
  await page.mouse.wheel(0, 100000);
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.keyboard.type("clear");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  const afterClear = await measure();

  // Simulate a tmux-style status bar pinned to the bottom of the tall PTY:
  // it must NOT inflate the scrollable height away from the end of input.
  await page.keyboard.type("printf '\\e[s\\e[1999;1HSTATUSBAR\\e[u'");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  const afterStatusBar = await measure();

  console.log(
    JSON.stringify(
      {
        before: { scrollHeight: before.scrollHeight, clientHeight: before.clientHeight },
        after: { scrollHeight: after.scrollHeight, scrollTop: after.scrollTop },
        checks: {
          startsUnscrolled: before.scrollHeight <= before.clientHeight + 2,
          grewWithContent: after.scrollHeight > before.clientHeight + 200,
          heightTracksContent: after.scrollHeight < 5000,
          pinnedToBottom,
          wheelScrolledUp,
          noYankWhileScrolledUp:
            Math.abs(afterTypeScrolledUp.scrollTop - afterWheel.scrollTop) <= 6,
          shrankAfterClear: afterClear.scrollHeight <= afterClear.clientHeight + 2,
          tallViewportKept: after.domRows >= 1000,
          seq100Rendered: textAfterSeq.includes("99100"),
          bottomStatusBarIgnored: afterStatusBar.scrollHeight < 2000,
        },
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
