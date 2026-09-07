import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import type { Manifest } from "@toskintaller/config";

/**
 * Diretórios que nunca devem entrar na build (workdir, node_modules, vcs, release).
 * O input é o `dist/` do app Freebuff; nada disso existe lá — defesa adicional.
 */
const EXCLUDED_DIRS = new Set([".spike-work", "node_modules", ".git", "release", "dist", "out"]);

/** mtime fixo (mesmo do stage) — makensis/asar embutem mtimes no artefato. */
const FIXED_MTIME = new Date("2024-01-01T00:00:00Z");

export interface InputInfo {
  /** Diretório absoluto da entrada validada (extraído, no caso de zip). */
  inputDir: string;
  /** Hash sha256 da árvore de arquivos (nome relativo + conteúdo). */
  fingerprint: string;
  /** Lista de arquivos relativos encontrados. */
  files: string[];
}

export interface RunInputOptions {
  /** Obrigatório quando input.type = "zip": onde extrair (dentro do workDir). */
  extractDir?: string;
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
 * Stage `input` (RF1): detecta e valida a entrada (pasta ou zip) e computa o fingerprint.
 * - folder: usa o diretório direto (build Vite: index.html na raiz);
 * - zip (Freebuff Builder → Download): extrai em `extractDir` e localiza a raiz do
 *   shape Vite (pasta com index.html — direto no zip ou em uma única subpasta).
 */
export async function runInput(
  manifest: Manifest,
  baseDir: string,
  options: RunInputOptions = {},
): Promise<InputInfo> {
  if (manifest.input.type === "zip") {
    return runInputZip(manifest, baseDir, options.extractDir);
  }
  return runInputFolder(manifest, baseDir);
}

async function runInputFolder(manifest: Manifest, baseDir: string): Promise<InputInfo> {
  const inputDir = path.resolve(baseDir, manifest.input.path);
  await assertViteShape(inputDir, manifest.input.entry);
  const files = await listFiles(inputDir);
  return { inputDir, fingerprint: await fingerprintTree(inputDir, files), files };
}

async function runInputZip(
  manifest: Manifest,
  baseDir: string,
  extractDir: string | undefined,
): Promise<InputInfo> {
  if (!extractDir) {
    throw new Error("[input] zip requer extractDir (pipeline fornece workDir/input)");
  }
  const zipPath = path.resolve(baseDir, manifest.input.path);
  let stat;
  try {
    stat = await fs.stat(zipPath);
  } catch {
    throw new Error(`[input] zip de entrada não encontrado: ${zipPath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`[input] caminho de entrada não é um arquivo zip: ${zipPath}`);
  }

  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  // Caminhos absolutos/`..` no zip são neutralizados pelo adm-zip (extractTo é relativo);
  // defesa extra: rejeita entradas perigosas antes de extrair.
  for (const entry of zip.getEntries()) {
    const name = entry.entryName;
    if (name.startsWith("/") || name.includes("..") || /^[a-zA-Z]:/.test(name)) {
      throw new Error(`[input] entrada suspeita no zip: ${name}`);
    }
  }
  zip.extractAllTo(extractDir, true);

  const root = await locateViteRoot(extractDir, manifest.input.entry);
  const files = (await listFiles(root)).map((rel) => path.posix.join(root === extractDir ? "" : path.basename(root), rel));
  const fingerprint = await fingerprintTree(root, await listFiles(root));
  return { inputDir: root, fingerprint, files };
}

/** Localiza a pasta com o entry (raiz do zip ou uma única subpasta — shape Freebuff). */
async function locateViteRoot(extractDir: string, entry: string): Promise<string> {
  if (await hasEntry(extractDir, entry)) return extractDir;
  const subdirs = (await fs.readdir(extractDir, { withFileTypes: true })).filter((d) => d.isDirectory());
  if (subdirs.length === 1) {
    const candidate = path.join(extractDir, subdirs[0].name);
    if (await hasEntry(candidate, entry)) return candidate;
  }
  throw new Error(
    `[input] shape Vite não encontrado no zip: ${entry} na raiz ou em uma única subpasta (${extractDir})`,
  );
}

async function hasEntry(dir: string, entry: string): Promise<boolean> {
  try {
    const st = await fs.stat(path.join(dir, entry));
    return st.isFile();
  } catch {
    return false;
  }
}

async function assertViteShape(inputDir: string, entry: string): Promise<void> {
  let st;
  try {
    st = await fs.stat(inputDir);
  } catch {
    throw new Error(`[input] pasta de entrada não encontrada: ${inputDir}`);
  }
  if (!st.isDirectory()) {
    throw new Error(`[input] caminho de entrada não é uma pasta: ${inputDir}`);
  }
  if (!(await hasEntry(inputDir, entry))) {
    throw new Error(
      `[input] entry point não encontrado: ${path.join(inputDir, entry)} (shape Vite: index.html na raiz da build)`,
    );
  }
}

/** Fingerprint = sha256(nome relativo + conteúdo) por arquivo, em ordem alfabética. */
async function fingerprintTree(inputDir: string, files: string[]): Promise<string> {
  const h = createHash("sha256");
  for (const rel of files) {
    h.update(rel);
    h.update(await fs.readFile(path.join(inputDir, rel)));
  }
  return h.digest("hex");
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
      html = html.replace(/(src|href)="\/(assets|fonts)\//g, (_m, attr, dir) => {
        return `${attr}="${dir}/`;
      });
      await fs.writeFile(dst, html, "utf8");
      await fs.utimes(dst, FIXED_MTIME, FIXED_MTIME);
    } else {
      await fs.copyFile(src, dst);
      await fs.utimes(dst, FIXED_MTIME, FIXED_MTIME);
    }
    copied.push(rel);
  }
  return { files: copied };
}

/**
 * Stage `stamp`: injeta `window.__TOSKINSTALLER__` com os metadados da build no entry point
 * e grava `toskinstaller.stamp.json` (lido pelo shell Electron — determinístico, sem depender
 * de variáveis de ambiente da máquina no bundle).
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
  await fs.utimes(entry, FIXED_MTIME, FIXED_MTIME);

  // Metadados lidos pelo shell Electron (appDir/app/toskinstaller.stamp.json)
  const stampFile = {
    appName: manifest.app.name,
    version: manifest.app.version,
    mode: manifest.mode,
    entry: manifest.input.entry,
    inputFingerprint,
    window: {
      width: manifest.window.width,
      height: manifest.window.height,
      minWidth: manifest.window.minWidth,
      minHeight: manifest.window.minHeight,
      autoHideMenuBar: manifest.window.autoHideMenuBar,
      ...(manifest.window.title ? { title: manifest.window.title } : {}),
      backgroundColor: manifest.window.backgroundColor,
    },
  };
  const stampPath = path.join(stageDir, "toskinstaller.stamp.json");
  await fs.writeFile(stampPath, `${JSON.stringify(stampFile, null, 2)}\n`, "utf8");
  await fs.utimes(stampPath, FIXED_MTIME, FIXED_MTIME);
}
