import { promises as fs } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { manifestSchema, PROGRESS_STYLES, type ProgressStyle } from "@toskintaller/config";
import { runPipeline, type BuildContext } from "@toskintaller/core";
import { installerNsisTarget } from "@toskintaller/installer-nsis";

interface BuildOptions {
  config: string;
  style?: string;
  out: string;
  allStyles?: boolean;
  work?: string;
}

async function buildOnce(opts: BuildOptions, style?: ProgressStyle): Promise<void> {
  const manifestPath = path.resolve(opts.config);
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const manifest = manifestSchema.parse(raw);
  if (style) {
    manifest.installScreen.progress.style = style;
  }

  const baseDir = path.dirname(manifestPath);
  // workDir FORA da pasta de entrada (evita recursão do input sobre o próprio work)
  const workDir = path.resolve(
    opts.work ?? path.join(process.cwd(), ".spike-work", style ?? manifest.installScreen.progress.style),
  );
  const outDir = path.resolve(opts.out, style ?? manifest.installScreen.progress.style);

  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });

  const ctx: BuildContext = {
    manifest,
    baseDir,
    workDir,
    outDir,
    target: installerNsisTarget,
    makensis: process.env.NSIS_MAKENSIS ?? "makensis",
    styleOverride: style ?? manifest.installScreen.progress.style,
    log: (msg) => {
      // silencioso por padrão; makensis verboso sai via stderr em erro
    },
  };

  const report = await runPipeline(ctx);
  console.log(
    `✔ [${report.target}] style=${report.style} → ${report.artifact.path} (${report.integrity[report.artifact.fileName]?.slice(0, 16)}…)`,
  );
}

const program = new Command();
program
  .name("toskintaller")
  .description("Toskinstaller — toolchain de empacotamento (spike técnico, Iteração 0)")
  .version("0.1.0");

program
  .command("build")
  .description("Roda o pipeline ponta a ponta (input→…→output) sobre um manifest")
  .requiredOption("--config <path>", "caminho do toskintaller.json")
  .option("--style <style>", "estilo de progresso (smooth|marquee|pulse|bars|dots)")
  .option("--out <dir>", "diretório de saída", "./release")
  .option("--work <dir>", "diretório de trabalho (default: .spike-work)")
  .option("--all-styles", "gera os 5 estilos da decisão S0.4")
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

program.parseAsync(process.argv).catch((err) => {
  console.error(`✖ ${(err as Error).message}`);
  process.exitCode = 1;
});