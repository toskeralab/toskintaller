import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { BuildContext, TargetAdapter, Artifact } from "@toskintaller/core";
import type { InputInfo } from "@toskintaller/input";
import { generateGradientBmp } from "./banner";
import { generateNsisScript } from "./template";

export { styleFragments } from "./styles";
export { generateNsisScript } from "./template";
export { generateGradientBmp } from "./banner";

export interface Makensis {
  bin: string;
  nsisDir?: string;
}

/**
 * Descobre o compilador NSIS:
 * 1. env NSIS_MAKENSIS (caminho explícito)
 * 2. `makensis` no PATH
 * 3. `.tools/nsis-extract/usr/bin/makensis` no repo (toolchain local do spike)
 */
export async function findMakensis(): Promise<Makensis | null> {
  return findMakensisSync();
}

/** Variante síncrona (útil para skip condicional em testes). */
export function findMakensisSync(): Makensis | null {
  if (process.env.NSIS_MAKENSIS) {
    return { bin: process.env.NSIS_MAKENSIS, nsisDir: process.env.NSISDIR };
  }
  const candidates = [
    "makensis",
    path.join(process.cwd(), ".tools", "nsis-extract", "usr", "bin", "makensis"),
  ];
  for (const bin of candidates) {
    if (!existsSync(bin)) continue;
    const nsisDir =
      process.env.NSISDIR ?? path.resolve(path.dirname(bin), "..", "share", "nsis");
    return { bin, nsisDir };
  }
  return null;
}

/**
 * Roda o makensis e retorna stdout/stderr; lança erro com saída em caso de falha.
 * cwd = diretório do script (paths relativos) e NSIS_SOURCE_DATE_EPOCH fixo
 * garantem builds reprodutíveis (mesma entrada → mesmo hash).
 */
async function runMakensis(makensis: Makensis, scriptPath: string): Promise<string> {
  const env = { ...process.env };
  if (makensis.nsisDir) env.NSISDIR = makensis.nsisDir;
  // Data de build fixa → PE header sem timestamp da máquina
  env.NSIS_SOURCE_DATE_EPOCH = process.env.NSIS_SOURCE_DATE_EPOCH ?? "1700000000";
  return new Promise((resolve, reject) => {
    const child = spawn(makensis.bin, ["-V4", path.basename(scriptPath)], {
      cwd: path.dirname(scriptPath),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`makensis falhou (exit ${code})\n${out}\n${err}`));
    });
  });
}

/** mtime fixo aplicado aos arquivos do render (makensis embute mtimes no instalador). */
const FIXED_MTIME = new Date("2024-01-01T00:00:00Z");

export const installerNsisTarget: TargetAdapter = {
  id: "windows-installer",
  hostRequirements: { os: ["win32", "linux", "darwin"], arch: ["x64"] },

  /** Render: gera banner.bmp + installer.nsi a partir do manifest. */
  async render(ctx: BuildContext, input: InputInfo): Promise<void> {
    const renderDir = path.join(ctx.workDir, "render");
    await fs.mkdir(renderDir, { recursive: true });

    // Banner: gradiente padrão do ToskeraLAB (spike não exige asset do usuário)
    const bannerPath = path.join(renderDir, "banner.bmp");
    const banner = generateGradientBmp({ width: 400, height: 30, from: "#0f766e", to: "#1e3a8a" });
    await fs.writeFile(bannerPath, banner);
    await fs.utimes(bannerPath, FIXED_MTIME, FIXED_MTIME);

    const outFile = path.join(ctx.workDir, "bundle", `${ctx.manifest.artifact.fileName}.exe`);
    const nsi = generateNsisScript({
      manifest: ctx.manifest,
      stageDir: path.join(ctx.workDir, "stage"),
      files: input.files,
      bannerSrc: bannerPath,
      outFile,
    });
    const nsiPath = path.join(renderDir, "installer.nsi");
    await fs.writeFile(nsiPath, nsi, "utf8");
    await fs.utimes(nsiPath, FIXED_MTIME, FIXED_MTIME);
  },

  /** Bundle: executa makensis sobre o installer.nsi gerado. */
  async bundle(ctx: BuildContext): Promise<Artifact> {
    const renderDir = path.join(ctx.workDir, "render");
    const bundleDir = path.join(ctx.workDir, "bundle");
    await fs.mkdir(bundleDir, { recursive: true });

    const makensis = await findMakensis();
    if (!makensis) {
      throw new Error(
        "[bundle] makensis não encontrado. Instale o NSIS ou defina NSIS_MAKENSIS (veja docs/SPIKE_ITERACAO_0.md)",
      );
    }
    const script = path.join(renderDir, "installer.nsi");
    const log = await runMakensis(makensis, script);
    ctx.log?.(log);

    const fileName = `${ctx.manifest.artifact.fileName}.exe`;
    const artifactPath = path.join(bundleDir, fileName);
    await fs.access(artifactPath); // garante que o makensis produziu
    return { path: artifactPath, fileName, makensisVersion: "3.08-2" };
  },
};