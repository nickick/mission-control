import { chromium } from "@playwright/test";

const state = {
  state: {
    pages: [
      {
        id: "page-test",
        name: "Test",
        terminals: [
          {
            id: "term-mol-0",
            name: "mol-0",
            shell: "/bin/zsh",
            command: "ssvta molt-0",
          },
          {
            id: "term-ssv",
            name: "ssv",
            shell: "/bin/zsh",
            command: "ssv",
          },
          {
            id: "term-ssr",
            name: "ssr",
            shell: "/bin/zsh",
            command: "ssr",
          },
        ],
      },
    ],
  },
  version: 0,
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });

await page.addInitScript((value) => {
  window.localStorage.setItem("mission-control:config", JSON.stringify(value));
}, state);

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForSelector(".terminal-cell", { timeout: 10000 });
await page.waitForTimeout(8000);

await page.evaluate(() => {
  const bodies = Array.from(document.querySelectorAll(".terminal-body"));
  bodies.forEach((body, index) => {
    if (index === 0) return;
    body.scrollTop = 0;
  });
});

const metrics = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".terminal-body")).map((body, index) => ({
    index,
    scrollHeight: body.scrollHeight,
    clientHeight: body.clientHeight,
    scrollTop: body.scrollTop,
    name: document.querySelectorAll(".terminal-header .name")[index]?.textContent ?? "",
  }))
);

console.log(JSON.stringify(metrics, null, 2));
await page.screenshot({ path: "/private/tmp/mission-control-three-columns.png", fullPage: true });
await browser.close();
