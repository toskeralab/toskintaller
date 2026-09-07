import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Manifest } from "@toskintaller/config";

/** Diretórios que nunca devem entrar na build (workdir, node_modules, vcs, release). */
const EXCLUDED_DIRS = new Set([".spike-work", "node_modules", ".git", "release", "dist", "out"]);

/** mtime fixo (mesmo do stage) — o makensis embute mtimes no instalador. */
const FIXED_MTIME = new Date("2024-01-01T00:00:00Z");

export interface InputInfo {
  /** Diretório absoluto da entrada validada. */
  inputDir: string;
  /** Hash sha256 da árvore de arquivos (nome relativo + conteúdo). */
  fingerprint: string;
  /** Lista de arquivos relativos encontrados. */
  files: string[];
}

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Lista todos os arquivos de um diretório (recursivo), caminhos relativos, ordenados. */
export async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string, rel: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      // ignora diretórios de trabalho/build (segurança contra recursão e ruído)
      if (e.isDirectory() && EXCLUDED_DIRS.has(e.name)) continue;
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await walk(path.join(current, e.name), relPath);
      } else {
        out.push(relPath);
      }
    }
  }
  await walk(dir, "");
  return out;
}

/**
 * Stage `input`: detecta e valida a entrada (pasta ou zip) e computa o fingerprint.
 * Para o spike, apenas `type: "folder"` é suportado (zip entra na Iteração 1, M2).
 */
export async function runInput(manifest: Manifest, baseDir: string): Promise<InputInfo> {
  if (manifest.input.type !== "folder") {
    throw new Error(`[input] tipo de entrada '${manifest.input.type}' não suportado no spike (apenas folder).`);
  }
  const inputDir = path.resolve(baseDir, manifest.input.path);
  let stat;
  try {
    stat = await fs.stat(inputDir);
  } catch {
    throw new Error(`[input] pasta de entrada não encontrada: ${inputDir}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`[input] caminho de entrada não é uma pasta: ${inputDir}`);
  }
  const entry = path.join(inputDir, manifest.input.entry);
  try {
    const st = await fs.stat(entry);
    if (!st.isFile()) throw new Error("not a file");
  } catch {
    throw new Error(`[input] entry point não encontrado: ${entry} (shape Vite: index.html na raiz da build)`);
  }

  const files = await listFiles(inputDir);
  const h = createHash("sha256");
  for (const rel of files) {
    h.update(rel);
    const content = await fs.readFile(path.join(inputDir, rel));
    h.update(content);
  }
  return { inputDir, fingerprint: h.digest("hex"), files };
}

/**
 * Stage `normalize`: reescreve caminhos absolutos de assets do Vite (`/assets/...`)
 * para relativos e grava a árvore normalizada em `dest`.
 */
export async function runNormalize(
  input: InputInfo,
  manifest: Manifest,
  dest: string,
): Promise<{ files: string[] }> {
  await fs.mkdir(dest, { recursive: true });
  const copied: string[] = [];
  for (const rel of input.files) {
    const src = path.join(input.inputDir, rel);
    const dst = path.join(dest, rel);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    if (rel === manifest.input.entry) {
      let html = await fs.readFile(src, "utf8");
      // Substitui /assets/... e /fonts/... por caminhos relativos
      html = html.replace(/(src|href)=["']\/(assets|fonts)\//g, (m, attr, dir) => {
        return `${attr}="${dir}/`;
      });
      await fs.writeFile(dst, html, "utf8");
    } else {
      await fs.copyFile(src, dst);
    }
    copied.push(rel);
  }
  return { files: copied };
}

/**
 * Stage `stamp`: injeta `window.__TOSKINSTALLER__` com os metadados da build no entry point.
 */
export async function runStamp(
  stageDir: string,
  manifest: Manifest,
  inputFingerprint: string,
): Promise<void> {
  const entry = path.join(stageDir, manifest.input.entry);
  let html = await fs.readFile(entry, "utf8");
  const meta = JSON.stringify({
    appId: manifest.app.id,
    appName: manifest.app.name,
    version: manifest.app.version,
    publisher: manifest.app.publisher,
    mode: manifest.mode,
    inputFingerprint,
    progressStyle: manifest.installScreen.progress.style,
  }).replace(/</g, "\\u003c");
  const script = `<script>window.__TOSKINSTALLER__=${meta};</script>`;
  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${script}</head>`);
  } else {
    html += script;
  }
  await fs.writeFile(entry, html, "utf8");
  // o stamp reescreve o arquivo → restaura mtime fixo (reprodutibilidade)
  await fs.utimes(entry, FIXED_MTIME, FIXED_MTIME);
}