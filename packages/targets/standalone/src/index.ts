/**
 * Target standalone (M5, RF3 modo 1): `.exe` portátil via electron-builder `portable`.
 *
 * Estratégia de reprodutibilidade (RNF Confiabilidade / DoD):
 * - stage `stamp` fixa mtimes + grava arquivos de metadados com conteúdo determinístico;
 * - SOURCE_DATE_EPOCH fixo → electron-builder grava o asar com mtimes fixos
 *   (recurso nativo da lib via SOURCE_DATE_EPOCH) e NSIS_SOURCE_DATE_EPOCH fixa o
 *   empacotamento NSIS do portable (mesma medida comprovada no spike);
 * - a versão do Electron vem do manifest (`electron.version`, pinada) — parte da
 *   chave de reprodutibilidade: mesma versão de toolchain + mesma entrada → mesmo hash;
 * - o arquivo do portable é editado via rcedit (ícone) SEM assinatura — fora do escopo.
 */
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import type { BuildContext, TargetAdapter, Artifact, TargetMode } from "@toskintaller/core";
import type { InputInfo } from "@toskintaller/input";

const FIXED_MTIME = new Date("2024-01-01T00:00:00Z");
/** Epoch fixo usado pelo electron-builder (SOURCE_DATE_EPOCH) e pelo makensis interno. */
const FIXED_EPOCH = "1704067200"; // 2024-01-01T00:00:00Z

/** Versão do electron-builder instalado no workspace (lida do package.json). */
function electronBuilderVersion(): string {
  try {
    const req = createRequire(import.meta.url);
    const pkg = req(path.join(REPO_ROOT, "node_modules", "app-builder-lib", "package.json")) as {
      version: string;
    };
    return String(pkg.version);
  } catch {
    return "unknown";
  }
}

// Raiz do monorepo (packages/targets/standalone/src → 4 níveis acima)
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const TEMPLATE_DIR = path.resolve(REPO_ROOT, "templates", "electron-shell");

/** Cópia recursiva determinística (ordem alfabética + mtime fixo). */
async function copyTreeFixed(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = (await fs.readdir(src, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      await copyTreeFixed(s, d);
    } else {
      await fs.copyFile(s, d);
      await fs.utimes(d, FIXED_MTIME, FIXED_MTIME);
    }
  }
}

async function writeIfChanged(file: string, content: string): Promise<void> {
  const prev = await fs.readFile(file, "utf8").catch(() => null);
  if (prev !== content) await fs.writeFile(file, content, "utf8");
}

interface RenderResult {
  appDir: string;
  renderDir: string;
  outFile: string;
  electronVersion: string;
}

/** Chave de render no ctx (ponte render → bundle dentro do adapter). */
const RENDER_KEY = "__toskinstaller_standalone_render__";
type CtxWithRender = BuildContext & { [RENDER_KEY]?: RenderResult };

export const standaloneWindowsTarget: TargetAdapter = {
  id: "windows-standalone",
  mode: "standalone" satisfies TargetMode,
  hostRequirements: { os: ["win32"], arch: ["x64"] },

  /**
   * Render: monta appDir do shell (template + app normalizado/stampado +
   * package.json + electron-builder.json) — tudo determinístico.
   */
  async render(ctx, _input): Promise<void> {
    const { manifest } = ctx;
    if (manifest.mode !== "standalone") {
      throw new Error(
        `[windows-standalone] modo do manifest é '${manifest.mode}'; este target gera standalone (RF3 modo 1). ` +
          `Use mode:"standalone" no manifest ou o target installer-nsis para instaladores.`,
      );
    }

    const renderDir = path.join(ctx.workDir, "render");
    const appDir = path.join(renderDir, "app");
    await fs.mkdir(appDir, { recursive: true });

    const electronVersion = manifest.electron?.version ?? "33.2.0";

    // 1. Template versionada do shell (pré-requisito de reprodutibilidade, §5 do PLANO)
    await copyTreeFixed(TEMPLATE_DIR, appDir);

    // 2. App Freebuff (normalizado + stampado) → appDir/app
    await copyTreeFixed(path.join(ctx.workDir, "stage"), path.join(appDir, "app"));

    // 3. package.json com metadados do manifest (electron-builder lê productName/version/author)
    const pkg = {
      name: "toskinstaller-shell",
      productName: manifest.app.name,
      version: manifest.app.version,
      private: true,
      main: "main.cjs",
      author: manifest.app.publisher || "ToskeraLAB",
      description: `${manifest.app.name} — empacotado com Toskinstaller`,
    };
    await writeIfChanged(path.join(appDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

    // 4. electron-builder.json — portable + asar; sem extras não determinísticos
    const fileName = manifest.artifact.fileName;
    const cfg = {
      appId: manifest.app.id,
      productName: manifest.app.name,
      electronVersion,
      artifactName: `${fileName}.${platformSpecific("exe").ext}`, // nome do artefato final (sem espaço)
      directories: { output: path.join(ctx.workDir, "bundle") },
      files: ["main.cjs", "preload.cjs", "app/**/*", "!node_modules/**"],
      asar: true,
      compression: manifest.artifact.compression === "store" ? "store" : "normal",
      npmRebuild: false,
      copyright: `Copyright © 2026 ${manifest.app.publisher || "ToskeraLAB"}`, // ano fixo (reprodutibilidade)
      win: {
        target: [{ target: "portable", arch: ["x64"] }],
        // assinatura de código fora do escopo do MVP (RNF/escopo Iteração 1)
        signAndEditExecutable: false,
      },
      portable: {
        // NSIS portable usa flag fixa; artefato final via SOURCE_DATE_EPOCH fixo
      },
    };

    /** ElectronBuilder espera `artifactName` com extensão; preenchemos a correta por plataforma. */
    function platformSpecific(defaultExt: string) {
      // só windows-standalone roda aqui; extensão fixa = .exe
      return { ext: "exe" };
    }
    await fs.writeFile(
      path.join(renderDir, "electron-builder.json"),
      `${JSON.stringify(cfg, null, 2)}\n`,
      "utf8",
    );

    (ctx as CtxWithRender)[RENDER_KEY] = {
      appDir,
      renderDir: path.join(ctx.workDir, "render"),
      outFile: path.join(ctx.workDir, "bundle", `${manifest.artifact.fileName}.exe`),
      electronVersion,
    };
  },

  /** Bundle: roda o CLI do electron-builder sobre o appDir renderizado. */
  async bundle(ctx): Promise<Artifact> {
    const render = (ctx as CtxWithRender)[RENDER_KEY];
    if (!render) throw new Error("[windows-standalone] render() deve rodar antes de bundle()");

    await fs.mkdir(path.join(ctx.workDir, "bundle"), { recursive: true });

    // electron-builder fica nas devDependencies do workspace (instalado no host)
    // electron-builder fica nas devDependencies do workspace (instalado no host);
    // o bin shim é um script shell (não CJS), então o spawn deve usar shell=true.
    const ebBin = path.join(REPO_ROOT, "node_modules", ".bin", "electron-builder");
    if (!existsSync(ebBin)) {
      throw new Error(
        "[windows-standalone] electron-builder não encontrado na raiz do workspace. " +
          "Instale com: pnpm add -D -w electron-builder",
      );
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SOURCE_DATE_EPOCH: FIXED_EPOCH,
      NSIS_SOURCE_DATE_EPOCH: FIXED_EPOCH,
      // electron-builder se comporta de forma diferente fora de CI; fixa o modo
      CI: process.env.CI ?? "true",
      // cache fora da pasta do usuário (pasta de trabalho = limpa a cada build)
      ELECTRON_BUILDER_CACHE: path.join(ctx.workDir, "cache"),
    };

    ctx.log?.(`[windows-standalone] bundle: electron-builder (electron ${render.electronVersion})`);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ebBin, ["--win", "--config", path.join(ctx.workDir, "render", "electron-builder.json")], {
        cwd: render.appDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32", // .CMD precisa de shell no Windows
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", reject);
      child.on("close", (code) => {
        ctx.log?.(out);
        if (code === 0) resolve();
        else reject(new Error(`electron-builder falhou (exit ${code})\n${out}\n${err}`));
      });
    });

    const artifactPath = render.outFile;
    await fs.access(artifactPath);
    const stat = await fs.stat(artifactPath);
    if (stat.size < 1_000_000) {
      throw new Error(`[windows-standalone] artefato suspeito (${stat.size} bytes) — bundle falhou silenciosamente`);
    }
    return {
      path: artifactPath,
      fileName: path.basename(artifactPath),
      electronBuilderVersion: electronBuilderVersion(),
    };
  },
};
