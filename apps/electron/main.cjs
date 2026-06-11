const { app, BrowserWindow, nativeImage } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

const WEB_URL = process.env.MISSION_CONTROL_WEB_URL ?? "http://127.0.0.1:3000";
const SERVER_URL = process.env.MISSION_CONTROL_SERVER_URL ?? "http://127.0.0.1:3001/stats";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://127.0.0.1:3001/pty";

const childProcesses = [];

app.setName("AI Mission Control");
// Keep userData where it lived before the rename — setName would otherwise
// point at a fresh directory and silently abandon the saved page config.
app.setPath("userData", path.join(app.getPath("appData"), "@mission-control", "electron"));

// Standalone launches run the production builds; set MISSION_CONTROL_DEV=1
// (or just have dev servers already running) for the dev workflow.
const DEV_MODE = process.env.MISSION_CONTROL_DEV === "1";

// Relaunching from Spotlight while already running focuses the existing
// window instead of starting a second instance.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});

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

function urlIsUp(url, timeoutMs = 1200) {
  return waitForUrl(url, timeoutMs).then(
    () => true,
    () => false
  );
}

async function createWindow() {
  // If the servers are already running (a previous instance, or manual
  // `pnpm dev`), reuse them instead of spawning duplicates — a second
  // `next dev` would silently pick a different port.
  const [webUp, serverUp] = await Promise.all([urlIsUp(WEB_URL), urlIsUp(SERVER_URL)]);
  if (!serverUp) spawnWorkspaceScript("@mission-control/server", DEV_MODE ? "dev" : "start");
  if (!webUp) {
    spawnWorkspaceScript("@mission-control/web", DEV_MODE ? "dev:app" : "start:app", {
      NEXT_PUBLIC_WS_URL: WS_URL,
    });
  }

  await Promise.all([waitForUrl(WEB_URL), waitForUrl(SERVER_URL)]);

  const iconPath = path.join(__dirname, "assets", "icon.png");
  if (process.platform === "darwin" && app.dock && fs.existsSync(iconPath)) {
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }

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
