import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Regressão do hotfix de assets (Iteração 3.1):
 *
 * O bug: serveStatic montava o caminho com path.resolve(UI_DIST, req.url) onde
 * req.url começa com "/" (caminho ABSOLUTO). path.resolve descarta a base e
 * resolve para a raiz do disco; o arquivo não existe; o request caía no SPA
 * fallback que devolvia index.html com Content-Type text/html para .js/.css.
 * O browser recusa o módulo ("Failed to load module script: MIME type text/html")
 * e a tela fica branca.
 *
 * Este teste garante:
 *  1. GET /assets/<arquivo real>.js → 200 + Content-Type application/javascript
 *  2. GET /assets/inexistente.js    → 404 REAL (nunca index.html/text/html)
 *  3. GET /                         → 200 + text/html (SPA fallback legítimo)
 */

const PORT = 3123;
const BASE = `http://127.0.0.1:${PORT}`;
const UI_DIST = path.resolve(process.cwd(), "apps", "ui", "dist");

let child: ChildProcess | null = null;

async function waitForServer(timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return;
    } catch {
      // servidor ainda não pronto
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("servidor local do wizard não ficou pronto a tempo");
}

beforeAll(async () => {
  // O teste precisa do build estático da UI; gera se estiver ausente.
  try {
    await fs.stat(path.join(UI_DIST, "index.html"));
  } catch {
    const { execSync } = await import("node:child_process");
    execSync("pnpm --filter toskintaller-ui build", { stdio: "inherit" });
  }

  child = spawn(
    process.execPath,
    ["--import", "tsx", "apps/cli/src/server/index.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(PORT) },
      stdio: "ignore",
    },
  );
  await waitForServer();
});

afterAll(async () => {
  if (child) {
    child.kill("SIGTERM");
    child = null;
  }
});

describe("servidor local — assets estáticos (regressão MIME)", () => {
  it("serve /assets/*.js com Content-Type application/javascript (não text/html)", async () => {
    const assetsDir = path.join(UI_DIST, "assets");
    const entries = await fs.readdir(assetsDir);
    const jsAsset = entries.find((f) => f.endsWith(".js"));
    expect(jsAsset, "build da UI deve produzir ao menos um .js em assets/").toBeTruthy();

    const res = await fetch(`${BASE}/assets/${jsAsset}`);
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") ?? "";
    expect(ct).toContain("application/javascript");
    const body = await res.text();
    expect(body).not.toContain("<!doctype html");
  });

  it("serve /assets/*.css com Content-Type text/css", async () => {
    const assetsDir = path.join(UI_DIST, "assets");
    const entries = await fs.readdir(assetsDir);
    const cssAsset = entries.find((f) => f.endsWith(".css"));
    if (!cssAsset) return; // build sem CSS separado: nada a validar
    const res = await fetch(`${BASE}/assets/${cssAsset}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/css");
  });

  it("asset inexistente sob /assets/ responde 404 REAL (nunca index.html)", async () => {
    const res = await fetch(`${BASE}/assets/inexistente-xyz-123.js`);
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain("<!doctype html");
    expect(res.headers.get("content-type") ?? "").not.toContain("text/html");
  });

  it("GET / responde 200 com text/html (SPA fallback legítimo)", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/html");
  });
});
