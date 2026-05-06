const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const WEB_URL = process.env.MISSION_CONTROL_WEB_URL ?? "http://127.0.0.1:3000";
const SERVER_URL = process.env.MISSION_CONTROL_SERVER_URL ?? "http://127.0.0.1:3001/stats";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://127.0.0.1:3001/pty";

const childProcesses = [];

app.commandLine.appendSwitch("remote-debugging-port", "9222");

function spawnWorkspaceScript(pkg, script, env = {}) {
  const child = spawn("pnpm", ["--filter", pkg, script], {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  childProcesses.push(child);
  child.on("exit", () => {
    const index = childProcesses.indexOf(child);
    if (index >= 0) childProcesses.splice(index, 1);
  });

  return child;
}

function waitForUrl(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const tryRequest = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });

      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(tryRequest, 500);
      });
    };

    tryRequest();
  });
}

async function createWindow() {
  spawnWorkspaceScript("@mission-control/server", "dev");
  spawnWorkspaceScript("@mission-control/web", "dev", {
    NEXT_PUBLIC_WS_URL: WS_URL,
  });

  await Promise.all([waitForUrl(WEB_URL), waitForUrl(SERVER_URL)]);

  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0c0c0c",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await window.loadURL(WEB_URL);
  window.webContents.openDevTools({ mode: "detach" });
}

function stopChildren() {
  for (const child of childProcesses) {
    if (!child.killed) child.kill();
  }
}

app.whenReady().then(() => {
  createWindow().catch((error) => {
    console.error(error);
    app.quit();
  });
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      console.error(error);
      app.quit();
    });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopChildren);
