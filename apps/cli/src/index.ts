import { promises as fs } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { manifestSchema, PROGRESS_STYLES, type ProgressStyle } from "@toskintaller/config";
import {
  runPipeline,
  registerTarget,
  declarePlannedTarget,
  resolveTarget,
  registeredTargets,
  registeredTargetEntries,
  getTarget,
  type BuildContext,
} from "@toskintaller/core";
import { installerNsisTarget } from "@toskintaller/installer-nsis";
import { standaloneWindowsTarget } from "@toskintaller/standalone";
import { sha256File, smokeBootExe, smokeSilentInstall, checkReproducibility, writeVerifyReport, type VerifyReport, type ReproducibilityResult } from "@toskintaller/verify";

// Registry (RF2/M10): a CLI registra os targets disponíveis; a escolha é por modo do
// manifest (standalone/installer) ou explícita via --target. Cada registro carrega a
// matriz de capacidades (M10) exibida por `toskintaller targets`.
registerTarget(installerNsisTarget, {
  status: "available",
  capabilities: {
    modes: ["installer"],
    progressStyles: [...PROGRESS_STYLES],
    supplementalInstalls: true,
    shortcuts: true,
    uninstaller: true,
    silentMode: true,
    artifactExtensions: [".exe"],
  },
});
// modo do installer-nsis no spike era implícito ("installer"); garantido pelo adapter
if (!installerNsisTarget.mode) {
  (installerNsisTarget as { mode?: string }).mode = "installer";
}
registerTarget(standaloneWindowsTarget, {
  status: "available",
  capabilities: {
    modes: ["standalone"],
    artifactExtensions: [".exe"],
  },
});

// M10 — preparação estrutural para plataformas futuras (Iteração 5):
// aparecem na matriz como "planned"; resolveTarget nunca os escolhe.
declarePlannedTarget("linux-standalone", "standalone", { os: ["linux"], arch: ["x64"] }, {
  modes: ["standalone"],
  artifactExtensions: [".AppImage"],
});
declarePlannedTarget("linux-installer", "installer", { os: ["linux"], arch: ["x64"] }, {
  modes: ["installer"],
  artifactExtensions: [".deb", ".AppImage"],
});
declarePlannedTarget("android-standalone", "standalone", { os: ["android"], arch: ["arm64"] }, {
  modes: ["standalone"],
  artifactExtensions: [".apk"],
});
declarePlannedTarget("apple-standalone", "standalone", { os: ["darwin"], arch: ["arm64", "x64"] }, {
  modes: ["standalone"],
  artifactExtensions: [".dmg", ".app.zip"],
});

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
  .option("--smoke", "executa os smokes da suíte verify (boot/PE + silent install em Windows) e grava o relatório M9")
  .option("--report <path>", "caminho do relatório verify-report.json (com --smoke)")
  .option("--repro-hash <hash>", "hash sha256 de um segundo build da mesma entrada — checagem de reprodutibilidade (M9)")
  .action(async (opts: { artifact: string; integrity: string; smoke?: boolean; report?: string; reproHash?: string }) => {
    try {
      const integrity = JSON.parse(await fs.readFile(opts.integrity, "utf8")) as {
        files: Record<string, string>;
      };
      const expected = integrity.files[path.basename(opts.artifact)];
      if (!expected) {
        throw new Error(`artefato não registrado no integrity.json: ${path.basename(opts.artifact)}`);
      }
      const artifactPath = path.resolve(opts.artifact);
      const actual = await sha256File(artifactPath);
      if (actual !== expected) {
        throw new Error(`checksum difere\n  esperado: ${expected}\n  atual:    ${actual}`);
      }
      console.log(`✔ artefato íntegro: ${path.basename(opts.artifact)} (${actual.slice(0, 16)}…)`);

      // M9 — checagem de reprodutibilidade: hash de um segundo build independente
      let reproducibility: ReproducibilityResult | undefined;
      if (opts.reproHash) {
        reproducibility = checkReproducibility(actual, opts.reproHash);
        const mark = reproducibility.passed ? "✔" : "✖";
        console.log(
          `${mark} reprodutibilidade: ${reproducibility.passed ? "hashes idênticos" : `hashes divergem (${reproducibility.hashA.slice(0, 16)}… vs ${reproducibility.hashB.slice(0, 16)}…)`}`,
        );
      }

      if (opts.smoke) {
        const smokes = [await smokeBootExe(artifactPath)];
        // silent-install: aplica-se a instaladores; em hosts não-Windows fica
        // "skipped" no relatório — a validação real é do CI windows-latest.
        if (path.basename(artifactPath).toLowerCase().includes("setup")) {
          smokes.push(
            await smokeSilentInstall(
              artifactPath,
              path.join(process.env.LOCALAPPDATA ?? ".", "Example App", "index.html"),
            ),
          );
        }
        const report: VerifyReport = {
          artifact: path.basename(artifactPath),
          sha256: actual,
          smokes,
          reproducibility,
          ok: smokes.every((s) => s.passed) && (reproducibility?.passed ?? true),
          generatedAt: new Date().toISOString(),
        };
        for (const s of smokes) {
          const mark = s.passed ? "✔" : "✖";
          console.log(`${mark} smoke ${s.name}: ${s.passed ? "ok" : s.error} (${s.durationMs}ms)`);
        }
        if (opts.report) {
          await writeVerifyReport(report, path.resolve(opts.report));
          console.log(`✔ relatório verify: ${opts.report}`);
        }
        if (!report.ok) {
          throw new Error("suíte verify falhou (smoke)");
        }
      }
    } catch (err) {
      console.error(`✖ verify: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

program
  .command("targets")
  .description("Lista os target adapters registrados (RF2) com a matriz de capacidades (M10)")
  .action(() => {
    for (const entry of registeredTargetEntries()) {
      const t = entry.adapter;
      const c = entry.capabilities;
      const status = entry.status === "available" ? "✓" : "planned";
      console.log(
        `${t.id.padEnd(22)} mode=${t.mode.padEnd(10)} host=${t.hostRequirements.os.join("|")} status=${status}`,
      );
      const caps: string[] = [];
      if (c.progressStyles?.length) caps.push(`styles=${c.progressStyles.join("/")}`);
      if (c.supplementalInstalls) caps.push("supplemental");
      if (c.shortcuts) caps.push("shortcuts");
      if (c.uninstaller) caps.push("uninstaller");
      if (c.silentMode) caps.push("silent");
      caps.push(`artifacts=${c.artifactExtensions.join(",")}`);
      console.log(`  ${"".padEnd(20)} ${caps.join(" ")}`);
    }
  });

// UI command — serve wizard (apps/ui/dist) + API local (127.0.0.1:3000)
program
  .command("ui")
  .description("Abre o wizard interativo (React) com API local em 127.0.0.1:3000")
  .option("--port <port>", "porta do servidor local", "3000")
  .action(async (opts) => {
    try {
      const server = await import("./server/index.ts");
    } catch (err) {
      console.error("✖ nao foi possivel iniciar o servidor UI: " + (err && Object.prototype.hasOwnProperty.call(err,"message") ? (err as any).message : String(err)));
      process.exitCode = 1;
    }
  });

// CLI `ui` também oferece comando `ui:build` para gerar o bundle estático quando desejado
program
  .command("ui:build")
  .description("Compila o wizard React para apps/ui/dist (build estática do Vite)")
  .action(async () => {
    try {
      const { execSync } = await import("node:child_process");
      const dist = path.resolve(process.cwd(), "apps", "ui", "dist");
      console.log("Compilando wizard estático em apps/ui/dist ...");
      execSync("pnpm --filter toskintaller-ui build", {
        cwd: process.cwd(),
        stdio: "inherit",
        env: { ...process.env, CI: "true" },
      });
      console.log(`✔ wizard estático pronto em ${dist}`);
    } catch (err) {
      console.error("✖ build da UI falhou: " + (err && Object.prototype.hasOwnProperty.call(err,"message") ? (err as any).message : String(err)));
      process.exitCode = 1;
    }
  });


program.parseAsync(process.argv).catch((err) => {
  console.error(`✖ ${(err as Error).message}`);
  process.exitCode = 1;
});
