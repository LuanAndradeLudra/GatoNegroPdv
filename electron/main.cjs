const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const http = require("http");
const crypto = require("crypto");

let serverProcess = null;
let appIsQuitting = false;

function getOrCreateJwtSecret(userData) {
  const p = path.join(userData, "jwt-secret.txt");
  try {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf8").trim();
    }
  } catch {
    /* ignore */
  }
  const s = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(p, s, "utf8");
  return s;
}

function ensureDatabase(userData, resourcesPath) {
  const userDb = path.join(userData, "gato-negro.db");
  if (fs.existsSync(userDb)) {
    return;
  }
  const template = path.join(resourcesPath, "db-template.sqlite");
  if (fs.existsSync(template)) {
    fs.copyFileSync(template, userDb);
  }
}

function waitForHealth(port) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 45_000;
    function tryOnce() {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
        } else if (Date.now() < deadline) {
          setTimeout(tryOnce, 120);
        } else {
          reject(new Error("API não respondeu (status " + res.statusCode + ")."));
        }
      });
      req.on("error", () => {
        if (Date.now() < deadline) {
          setTimeout(tryOnce, 120);
        } else {
          reject(new Error("Não foi possível conectar à API local."));
        }
      });
      req.setTimeout(800, () => {
        req.destroy();
        if (Date.now() < deadline) {
          setTimeout(tryOnce, 120);
        } else {
          reject(new Error("Timeout ao aguardar API."));
        }
      });
    }
    tryOnce();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Gato Negro — PDV",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    const port = process.env.API_PORT || "3001";
    win.loadURL(`http://127.0.0.1:${port}`);
  }
}

app.whenReady().then(async () => {
  const port = process.env.API_PORT || "3001";

  if (app.isPackaged) {
    const userData = app.getPath("userData");
    ensureDatabase(userData, process.resourcesPath);
    const jwtSecret = getOrCreateJwtSecret(userData);
    const dbUrl = "file:" + path.join(userData, "gato-negro.db").replace(/\\/g, "/");
    const appRoot = app.getAppPath();
    const serverJs = path.join(appRoot, "dist-server", "index.js");

    serverProcess = spawn(process.execPath, [serverJs], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
        DATABASE_URL: dbUrl,
        JWT_SECRET: jwtSecret,
        API_PORT: String(port),
      },
      cwd: appRoot,
      stdio: "inherit",
    });

    serverProcess.on("error", (err) => {
      console.error("[api spawn]", err);
    });

    serverProcess.on("exit", (code) => {
      if (code != null && code !== 0 && !appIsQuitting) {
        dialog.showErrorBox(
          "Gato Negro PDV",
          "O servidor interno encerrou com erro (código " + code + ").",
        );
      }
    });

    try {
      await waitForHealth(port);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      dialog.showErrorBox("Gato Negro PDV", "Não foi possível iniciar a API:\n" + msg);
      app.quit();
      return;
    }
  }

  createWindow();
});

app.on("before-quit", () => {
  appIsQuitting = true;
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {
      /* ignore */
    }
    serverProcess = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
