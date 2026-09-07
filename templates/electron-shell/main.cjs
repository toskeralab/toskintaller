// Toskinstaller — electron-shell (M4): shell fino do app empacotado (ADR-2).
// Serve a build estática Freebuff via protocolo privado app:// (sem porta HTTP local),
// com SPA fallback (index.html) para rotas profundas (React Router).
//
// S0.1: o Convex recebe Origin app://toskinstaller e responde
// `Access-Control-Allow-Origin: *` (default do Convex — sem allowlist de origins),
// então a conexão funciona sem configuração no deployment.
// Fallback S0.1: se um deployment tiver allowlist estrita, definir
// TOSKINSTALLER_HTTP_FALLBACK=1 serve a build em http://127.0.0.1:<porta> (origin http).
"use strict";

const { app, BrowserWindow, protocol, net, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const APP_ROOT = path.join(__dirname, "app");
const SCHEME = "app";
const APP_ORIGIN = "app://toskinstaller"; // deve bater com APP_ORIGIN em smoke-app-shell.mjs

// ── Stamp injetado pelo stage `stamp` (metadados da build) ───────────
let stamp = {};
try {
  stamp = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "toskinstaller.stamp.json"), "utf8"));
} catch {
  stamp = { appName: "Toskinstaller App" };
}

// ── app:// (MIME mínimo da build Vite; fallback genérico application/octet-stream)
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain",
};

function serveFile(filePath) {
  return new Response(fs.readFileSync(filePath), {
    headers: {
      "content-type": MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
      // S0.1: CORS do handler permissivo — o Convex responde ACAO:* e o Chromium
      // valida contra a origin do chamante (app://toskinstaller).
      "access-control-allow-origin": "*",
    },
  });
}

function resolveAppFile(urlPath) {
  const rel = decodeURIComponent(urlPath.replace(/^\/+/, ""));
  const candidate = path.join(APP_ROOT, rel);
  if (candidate.startsWith(APP_ROOT) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }
  // SPA fallback (React Router/history API): qualquer rota sem arquivo cai no entry
  return path.join(APP_ROOT, stamp.entry ?? "index.html");
}

// ── Modo smoke (S0.1): valida boot + protocolo + CORS do Convex sem janela ──
// (executado pelo CI Windows real — vê o resultado via exit code + stdout)
if (process.env.TOSKINSTALLER_SMOKE === "1") {
  const { net: netModule } = require("electron");
  app.whenReady().then(async () => {
    const result = { boot: true, protocol: false, convexCors: false, error: null };
    try {
      result.protocol = await new Promise((resolve, reject) => {
        const req = netModule.request(`${APP_ORIGIN}/index.html`);
        req.on("response", (response) => {
          resolve(response.statusCode === 200);
        });
        req.on("error", reject);
        req.end();
      });
      if (process.env.VITE_CONVEX_URL) {
        result.convexCors = await new Promise((resolve, reject) => {
          const req = netModule.request(`${process.env.VITE_CONVEX_URL}/api/query`, {
            method: "OPTIONS",
          });
          req.setHeader("Origin", APP_ORIGIN);
          req.setHeader("Access-Control-Request-Method", "POST");
          req.on("response", (response) => {
            const allow = response.headers["access-control-allow-origin"];
            resolve(
              response.statusCode < 400 &&
                Array.isArray(allow) &&
                (allow.includes("*") || allow.includes(APP_ORIGIN)),
            );
          });
          req.on("error", reject);
          req.end();
        });
      } else {
        result.convexCors = null; // sem backend configurado — smoke valida só o boot/protocolo
      }
    } catch (err) {
      result.error = String(err && err.message ? err.message : err);
    }
    process.stdout.write(`SMOKE_RESULT ${JSON.stringify(result)}\n`);
    process.exit(result.protocol && result.error === null ? 0 : 1);
  });
} else {
  // ── Registro do protocolo privado (secure; sem suporte a service worker no MVP) ──
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);

  const isPrimary = app.requestSingleInstanceLock();
  if (!isPrimary) {
    app.quit();
  }

  let mainWindow = null;

  function createWindow() {
    const winCfg = stamp.window ?? {};
    mainWindow = new BrowserWindow({
      width: winCfg.width ?? 1280,
      height: winCfg.height ?? 800,
      minWidth: winCfg.minWidth ?? 960,
      minHeight: winCfg.minHeight ?? 600,
      autoHideMenuBar: winCfg.autoHideMenuBar ?? true,
      title: winCfg.title ?? stamp.appName ?? "Toskinstaller App",
      backgroundColor: winCfg.backgroundColor ?? "#0f172a",
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true, // RNF Segurança
        nodeIntegration: false,
        sandbox: true,
      },
    });

    // CSP compatível com a origin do app (evita aviso de console do Electron)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self' app://*; script-src 'self' app://* 'unsafe-inline'; style-src 'self' app://* 'unsafe-inline'; connect-src 'self' app://* https: wss:; img-src 'self' app://* data:",
          ],
        },
      });
    });

    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  }

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle(SCHEME, (request) => {
      const { pathname } = new URL(request.url);
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, HEAD, OPTIONS",
          },
        });
      }
      return serveFile(resolveAppFile(pathname));
    });

    if (process.env.TOSKINSTALLER_HTTP_FALLBACK === "1") {
      // Fallback S0.1: origin http local (deployments Convex com allowlist estrita)
      const server = http.createServer((req, res) => {
        try {
          const file = resolveAppFile(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
          res.writeHead(200, {
            "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
          });
          fs.createReadStream(file).pipe(res);
        } catch (err) {
          res.writeHead(500);
          res.end(String(err));
        }
      });
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        createWindow();
        mainWindow.loadURL(`http://127.0.0.1:${addr.port}/`);
      });
    } else {
      createWindow();
      mainWindow.loadURL(`${APP_ORIGIN}/`);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
