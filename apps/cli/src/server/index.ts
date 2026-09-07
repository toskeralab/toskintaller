import { promises as fs } from "node:fs";
import path from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { manifestSchema } from "@toskintaller/config";
import { generateNsisScript } from "@toskintaller/installer-nsis";
import { generateGradientBmp } from "@toskintaller/installer-nsis";
import { runPipeline } from "@toskintaller/core";
import type { Manifest } from "@toskintaller/config";

const PORT = 3000;
const UI_DIST = path.resolve(process.cwd(), "apps", "ui", "dist");

function contentForPath(p: string): string | null {
  const ext = path.extname(p).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
      ".eot": "application/vnd.ms-fontobject",
    }[ext] ?? null
  );
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url ?? "/";
  const decoded = decodeURIComponent(url);
  const statPath = path.resolve(UI_DIST, decoded);

  // Proteção contra path traversal
  if (!statPath.startsWith(UI_DIST)) return false;

  try {
    const stat = await fs.stat(statPath);
    if (!stat.isFile()) return false;
    const body = await fs.readFile(statPath);
    const ct = contentForPath(statPath);
    res.statusCode = 200;
    res.setHeader("Content-Type", ct ?? "application/octet-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.end(body);
    return true;
  } catch {
    return false;
  }
}
const HOST = "127.0.0.1";

function json(res: ServerResponse, data: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function cors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseQuery(req: IncomingMessage): Record<string, string> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const qs: Record<string, string> = {};
  for (const [k, v] of url.searchParams) qs[k] = v;
  return qs;
}

async function handleScan(req: IncomingMessage, res: ServerResponse): Promise<void> {
  cors(res);
  if (req.method === "OPTIONS") return json(res, {});
  const qs = parseQuery(req);
  const dir = qs["dir"];
  if (!dir) return json(res, { error: "dir é obrigatório" }, 400);
  try {
    const fullDir = path.resolve(dir);
    const entries = await fs.readdir(fullDir, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile()).map((e) => e.name).sort();
    const entry = files.includes("index.html") ? "index.html" : (files[0] ?? null);
    json(res, { files, entry, exists: true });
  } catch (e) {
    json(res, { error: (e as Error).message, exists: false }, 400);
  }
}

async function handleManifestGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
  cors(res);
  if (req.method === "OPTIONS") return json(res, {});
  const qs = parseQuery(req);
  const p = qs["path"];
  if (!p) return json(res, { error: "path é obrigatório" }, 400);
  try {
    const raw = await fs.readFile(path.resolve(p), "utf8");
    const parsed = JSON.parse(raw);
    const validated = manifestSchema.parse(parsed);
    json(res, validated as unknown as Record<string, unknown>);
  } catch (e) {
    json(res, { error: (e as Error).message }, 400);
  }
}

async function handleManifestSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  cors(res);
  if (req.method === "OPTIONS") return json(res, {});
  if (req.method !== "POST") return json(res, { error: "metodo nao permitido" }, 405);
  const body = await parseBody(req);
  let data: { path: string; data: Record<string, unknown> };
  try { data = JSON.parse(body); } catch { return json(res, { error: "body invalido" }, 400); }
  try {
    const validated = manifestSchema.parse(data.data);
    await fs.writeFile(path.resolve(data.path), JSON.stringify(validated, null, 2), "utf8");
    json(res, { ok: true });
  } catch (e) {
    json(res, { error: (e as Error).message }, 400);
  }
}

async function handlePreview(req: IncomingMessage, res: ServerResponse): Promise<void> {
  cors(res);
  if (req.method === "OPTIONS") return json(res, {});
  if (req.method !== "POST") return json(res, { error: "metodo nao permitido" }, 405);
  const body = await parseBody(req);
  let manifest: Manifest;
  try { manifest = manifestSchema.parse(JSON.parse(body)); } catch (e) {
    return json(res, { error: (e as Error).message }, 400);
  }
  try {
    const nsi = generateNsisScript({
      manifest,
      stageDir: "/tmp/preview-stage",
      files: [],
      bannerSrc: "/tmp/preview-banner.bmp",
      outFile: "/tmp/preview-out.exe",
    });
    let bannerPng: string | null = null;
    try {
      const banner = generateGradientBmp({ width: 400, height: 30, from: "#0f766e", to: "#1e3a8a" });
      const tmpBmp = path.resolve("/tmp/preview-banner.bmp");
      await fs.mkdir(path.dirname(tmpBmp), { recursive: true });
      await fs.writeFile(tmpBmp, banner);
      bannerPng = "data:image/bmp;base64," + banner.toString("base64");
    } catch {}
    json(res, { nsi, bannerPng });
  } catch (e) {
    json(res, { error: (e as Error).message }, 500);
  }
}

async function handleBuild(req: IncomingMessage, res: ServerResponse): Promise<void> {
  cors(res);
  if (req.method === "OPTIONS") return json(res, {});
  if (req.method !== "POST") return json(res, { error: "metodo nao permitido" }, 405);
  const body = await parseBody(req);
  let manifest: Manifest;
  try { manifest = manifestSchema.parse(JSON.parse(body)); } catch (e) {
    return json(res, { error: (e as Error).message }, 400);
  }
  const workDir = path.resolve(".spike-work/ui-build", String(Date.now()));
  const outDir = path.resolve(manifest.artifact?.outDir ?? "./release");
  const target: any = manifest.mode === "installer"
    ? { id: "windows-installer", mode: "installer" }
    : { id: "windows-standalone", mode: "standalone" };
  try {
    await fs.mkdir(workDir, { recursive: true });
    const ctx: any = {
      manifest,
      baseDir: process.cwd(),
      workDir,
      outDir,
      target,
      makensis: "makensis",
      styleOverride: manifest.installScreen?.progress?.style,
    };
    const report = await runPipeline(ctx);
    json(res, { ok: true, artifactPath: report.artifact.path, hash: report.integrity[report.artifact.fileName] ?? "" });
  } catch (e) {
    json(res, { error: (e as Error).message }, 500);
  }
}

async function handleArtifact(req: IncomingMessage, res: ServerResponse): Promise<void> {
  cors(res);
  const qs = parseQuery(req);
  const p = qs["path"];
  if (!p) return json(res, { error: "path e obrigatorio" }, 400);
  try {
    const buf = await fs.readFile(path.resolve(p));
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/octet-stream");
    const fname = path.basename(p);
    res.setHeader("Content-Disposition", "attachment; filename=\"" + fname + "\"");
    res.end(buf);
  } catch (e) {
    json(res, { error: (e as Error).message }, 404);
  }
}

async function findIndexHtml(urlPath: string): Promise<string | null> {
  const decoded = decodeURIComponent(urlPath);
  const decodedPath = path.resolve(UI_DIST, decoded);
  if (!decodedPath.startsWith(UI_DIST)) return null;
  try {
    const stat = await fs.stat(decodedPath);
    if (stat.isFile()) return decodedPath;
    if (stat.isDirectory()) {
      const indexPath = path.join(decodedPath, "index.html");
      const iStat = await fs.stat(indexPath);
      if (iStat.isFile()) return indexPath;
    }
  } catch {}
  return null;
}

const server = createServer(async (req, res) => {
  const url = req.url ?? "/";

  // 1) Rotas da API com prioridade
  if (url.startsWith("/api/scan")) return handleScan(req, res);
  if (url.startsWith("/api/manifest")) {
    if (req.method === "GET") return handleManifestGet(req, res);
    if (req.method === "POST") return handleManifestSave(req, res);
  }
  if (url.startsWith("/api/preview")) return handlePreview(req, res);
  if (url.startsWith("/api/build")) return handleBuild(req, res);
  if (url.startsWith("/api/artifact")) return handleArtifact(req, res);

  // 2) Static assets do wizard (e.x.: /assets/index-xxx.js, /assets/index-xxx.css)
  if (url.startsWith("/assets/")) {
    const served = await serveStatic(req, res);
    if (served) return;
  }

  // 3) SPA fallback: qualquer outra rota retorna index.html (navegação interna do wizard)
  const indexPath = path.resolve(UI_DIST, "index.html");
  try {
    const iStat = await fs.stat(indexPath);
    if (iStat.isFile()) {
      const body = await fs.readFile(indexPath);
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html");
      res.end(body);
      return;
    }
  } catch {}

  res.statusCode = 404;
  res.end("not found");
});

let uiBuilt = false;
try {
  await fs.stat(path.resolve(UI_DIST, "index.html"));
  uiBuilt = true;
} catch {}

server.listen(PORT, HOST, () => {
  console.log(`Toskinstaller UI: http://127.0.0.1:${PORT}`);
  console.log(`  API: /api/* (scan, manifest, preview, build, artifact)`);
  console.log(`  Wizard: ${uiBuilt ? "servindo apps/ui/dist ✓" : "falta apps/ui/dist — rode 'pnpm --filter toskintaller-ui build'"}`);
});
