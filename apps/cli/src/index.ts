import { promises as fs } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { manifestSchema, PROGRESS_STYLES, type ProgressStyle } from "@toskintaller/config";
import {
  runPipeline,
  registerTarget,
  resolveTarget,
  registeredTargets,
  getTarget,
  type BuildContext,
} from "@toskintaller/core";
import { installerNsisTarget } from "@toskintaller/installer-nsis";
import { standaloneWindowsTarget } from "@toskintaller/standalone";
import { sha256File } from "@toskintaller/verify";

// Registry (RF2/M10): a CLI registra os targets disponíveis; a escolha é por modo do
// manifest (standalone/installer) ou explícita via --target.
registerTarget(installerNsisTarget);
// modo do installer-nsis no spike era implícito ("installer"); garantido pelo adapter
if (!installerNsisTarget.mode) {
  (installerNsisTarget as { mode?: string }).mode = "installer";
}
registerTarget(standaloneWindowsTarget);

interface BuildOptions {
  config: string;
  style?: string;
  out: string;
  allStyles?: boolean;
  work?: string;
  target?: string;
}

async function loadManifest(configPath: string) {
  const manifestPath = path.resolve(configPath);
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const manifest = manifestSchema.parse(raw);
  return { manifest, baseDir: path.dirname(manifestPath) };
}

async function buildOnce(opts: BuildOptions, style?: ProgressStyle): Promise<void> {
  const { manifest, baseDir } = await loadManifest(opts.config);
  if (style) {
    manifest.installScreen.progress.style = style;
  }

  // RF2: escolha do target — explícita via --target ou pelo modo do manifest
  const target = opts.target ? getTarget(opts.target) : resolveTarget(manifest);

  const workDir = path.resolve(
    opts.work ??
      path.join(
        process.cwd(),
        ".spike-work",
        `${target.id}-${style ?? manifest.installScreen.progress.style}`,
      ),
  );
  const outDir = path.resolve(opts.out, style ?? manifest.mode);

  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });

  const ctx: BuildContext = {
    manifest,
    baseDir,
    workDir,
    outDir,
    target,
    makensis: process.env.NSIS_MAKENSIS ?? "makensis",
    styleOverride: style ?? manifest.installScreen.progress.style,
    log: (msg) => {
      if (process.env.TOSKINTALLER_VERBOSE) process.stdout.write(`${msg}\n`);
    },
  };

  const report = await runPipeline(ctx);
  const hash = report.integrity[report.artifact.fileName] ?? "";
  console.log(
    `✔ [${report.target}] style=${report.style} → ${report.artifact.path} (${hash.slice(0, 16)}…)`,
  );
}

const program = new Command();
program
  .name("toskintaller")
  .description("Toskinstaller — toolchain de empacotamento de apps Freebuff (Iteração 1)")
  .version("0.1.0");

program
  .command("build")
  .description("Roda o pipeline ponta a ponta (input→…→output) sobre um manifest")
  .requiredOption("--config <path>", "caminho do toskintaller.json")
  .option("--style <style>", "estilo de progresso (smooth|marquee|pulse|bars|dots)")
  .option("--target <id>", "id do target (windows-standalone | windows-installer)")
  .option("--out <dir>", "diretório de saída", "./release")
  .option("--work <dir>", "diretório de trabalho (default: .spike-work)")
  .option("--all-styles", "gera os 5 estilos da decisão S0.4 (modo installer)")
  .action(async (opts: BuildOptions) => {
    try {
      if (opts.allStyles) {
        for (const style of PROGRESS_STYLES) {
          await buildOnce(opts, style);
        }
      } else {
        await buildOnce(opts, opts.style as ProgressStyle | undefined);
      }
    } catch (err) {
      console.error(`✖ ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

program
  .command("verify")
  .description("Confere o sha256 do artefato contra o integrity.json do build")
  .requiredOption("--artifact <path>", "caminho do .exe")
  .requiredOption("--integrity <path>", "caminho do integrity.json")
  .action(async (opts: { artifact: string; integrity: string }) => {
    try {
      const integrity = JSON.parse(await fs.readFile(opts.integrity, "utf8")) as {
        files: Record<string, string>;
      };
      const expected = integrity.files[path.basename(opts.artifact)];
      if (!expected) {
        throw new Error(`artefato não registrado no integrity.json: ${path.basename(opts.artifact)}`);
      }
      const actual = await sha256File(path.resolve(opts.artifact));
      if (actual !== expected) {
        throw new Error(`checksum difere\n  esperado: ${expected}\n  atual:    ${actual}`);
      }
      console.log(`✔ artefato íntegro: ${path.basename(opts.artifact)} (${actual.slice(0, 16)}…)`);
    } catch (err) {
      console.error(`✖ verify: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

program
  .command("targets")
  .description("Lista os target adapters registrados (RF2)")
  .action(() => {
    for (const t of registeredTargets()) {
      console.log(`${t.id.padEnd(22)} mode=${t.mode.padEnd(10)} host=${t.hostRequirements.os.join("|")}`);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(`✖ ${(err as Error).message}`);
  process.exitCode = 1;
});
