import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { manifestSchema, PROGRESS_STYLES } from "@toskintaller/config";
import { runPipeline, type BuildContext } from "@toskintaller/core";
import { findMakensisSync, installerNsisTarget } from "@toskintaller/installer-nsis";

const fixtureDir = path.resolve("fixtures/example-app");
const manifestPath = path.join(fixtureDir, "toskintaller.json");

describe("pipeline e2e (Iteração 0)", () => {
  const maybe = it.skipIf(findMakensisSync() === null);

  maybe("roda input→…→output e gera .exe para os 5 estilos", async () => {
    const raw = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const manifest = manifestSchema.parse(raw);

    for (const style of PROGRESS_STYLES) {
      const m = manifestSchema.parse({ ...manifest, installScreen: { ...manifest.installScreen, progress: { style } } });
      const workDir = path.resolve(`.spike-work/e2e/${style}`);
      const outDir = path.resolve(`release/spike-test/${style}`);
      await fs.rm(workDir, { recursive: true, force: true });
      await fs.mkdir(workDir, { recursive: true });

      const ctx: BuildContext = {
        manifest: m,
        baseDir: fixtureDir,
        workDir,
        outDir,
        target: installerNsisTarget,
        makensis: process.env.NSIS_MAKENSIS ?? "makensis",
        styleOverride: style,
      };

      const report = await runPipeline(ctx);
      expect(report.artifact.fileName).toBe(`${m.artifact.fileName}.exe`);
      const stat = await fs.stat(report.artifact.path);
      expect(stat.size).toBeGreaterThan(0);
      // integridade registrada
      expect(report.integrity[report.artifact.fileName]).toMatch(/^[0-9a-f]{64}$/);
      // o .exe gerado pelo makensis é um PE (assinatura MZ)
      const head = await fs.readFile(report.artifact.path);
      expect(head.subarray(0, 2).toString("ascii")).toBe("MZ");
    }
  }, 180_000);

  maybe("é reprodutível: mesmo input + manifest → mesmo hash (RNF Confiabilidade)", async () => {
    const raw = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const manifest = manifestSchema.parse(raw);

    async function buildOnce(style: string, workDir: string, outDir: string): Promise<string> {
      const m = manifestSchema.parse({
        ...manifest,
        installScreen: { ...manifest.installScreen, progress: { style } },
      });
      await fs.rm(workDir, { recursive: true, force: true });
      await fs.mkdir(workDir, { recursive: true });
      const report = await runPipeline({
        manifest: m,
        baseDir: fixtureDir,
        workDir,
        outDir,
        target: installerNsisTarget,
        makensis: process.env.NSIS_MAKENSIS ?? "makensis",
        styleOverride: style,
      });
      return report.integrity[report.artifact.fileName];
    }

    const h1 = await buildOnce("smooth", path.resolve(".spike-work/repro-a"), path.resolve("release/spike-repro/a"));
    const h2 = await buildOnce("smooth", path.resolve(".spike-work/repro-b"), path.resolve("release/spike-repro/b"));
    expect(h1).toBe(h2);
  }, 120_000);
});