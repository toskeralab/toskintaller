import { promises as fs } from "node:fs";
import path from "node:path";
import type { Manifest } from "@toskintaller/config";
import { runInput, runNormalize, runStamp, type InputInfo } from "@toskintaller/input";
import { writeIntegrityManifest } from "@toskintaller/verify";

/** Resultado do stage `bundle`: artefato produzido. */
export interface Artifact {
  /** Caminho absoluto do arquivo .exe gerado. */
  path: string;
  /** Nome do arquivo (ex.: MeuApp-Setup-1.0.0.exe). */
  fileName: string;
  /** Versão do makensis usado (informação do relatório). */
  makensisVersion?: string;
}

/** Contexto compartilhado entre os stages. */
export interface BuildContext {
  manifest: Manifest;
  /** Diretório da build (cwd do manifest). */
  baseDir: string;
  /** Diretório de trabalho (workDir), criado pelo pipeline. */
  workDir: string;
  /** Diretório de saída final. */
  outDir: string;
  /** Stage que gerou o artefato. */
  target: TargetAdapter;
  /** Caminho do compilador NSIS (makensis). */
  makensis: string;
  /** Diretório do NSIS (NSISDIR), quando aplicável. */
  nsisDir?: string;
  /** Substituir o estilo de progresso do manifest (usado no spike para gerar os 5 estilos). */
  styleOverride?: string;
  /** Callback opcional de log (CLI/CI exibem a saída do makensis). */
  log?: (msg: string) => void;
}

/** Contrato de um target adapter (ADR-1/§7 do ARQUITETURA.md). */
export interface TargetAdapter {
  id: string;
  hostRequirements: { os: string[]; arch: string[] };
  render(ctx: BuildContext, input: InputInfo): Promise<void>;
  bundle(ctx: BuildContext): Promise<Artifact>;
}

/** Relatório final do pipeline. */
export interface BuildReport {
  target: string;
  style: string;
  artifact: Artifact;
  integrity: Record<string, string>;
  inputFingerprint: string;
}

/**
 * Esqueleto do pipeline: input → normalize → stage → stamp → render → bundle → verify → output.
 * Cada stage é uma função pura sobre `ctx`; o pipeline orquestra a ordem e os diretórios.
 */
export async function runPipeline(ctx: BuildContext): Promise<BuildReport> {
  const { manifest } = ctx;

  // 1. input — detecta e valida a entrada
  const input = await runInput(manifest, ctx.baseDir);

  // 2. normalize — reescreve assets absolutos p/ relativos
  const normalizeDir = path.join(ctx.workDir, "normalize");
  await runNormalize(input, manifest, normalizeDir);

  // 3. stage — cópia determinística (no spike, reusa normalize; M2 aprofunda no incremental)
  const stageDir = path.join(ctx.workDir, "stage");
  await copyTree(normalizeDir, stageDir);

  // 4. stamp — injeta metadados no entry point
  await runStamp(stageDir, manifest, input.fingerprint);

  // 5. render — o target gera o que lhe cabe (páginas NSIS, recursos)
  await ctx.target.render(ctx, input);

  // 6. bundle — compilador produz o artefato
  const artifact = await ctx.target.bundle(ctx);

  // 7. verify — checksums + manifest de integridade
  const integrity = await writeIntegrityManifest(artifact.path, path.join(ctx.workDir, "verify"));

  // 8. output — copia artefato para outDir
  await fs.mkdir(ctx.outDir, { recursive: true });
  const finalArtifactPath = path.join(ctx.outDir, artifact.fileName);
  await fs.copyFile(artifact.path, finalArtifactPath);
  await fs.copyFile(
    path.join(ctx.workDir, "verify", "integrity.json"),
    path.join(ctx.outDir, "integrity.json"),
  );

  return {
    target: ctx.target.id,
    style: ctx.styleOverride ?? manifest.installScreen.progress.style,
    artifact: { ...artifact, path: finalArtifactPath },
    integrity,
    inputFingerprint: input.fingerprint,
  };
}

/**
 * Cópia recursiva simples e determinística (ordem estável + mtime fixo).
 * O makensis embute o mtime dos arquivos no instalador; sem mtime fixo,
 * dois builds da mesma entrada produzem .exe com hashes diferentes.
 */
const FIXED_MTIME = new Date("2024-01-01T00:00:00Z");

async function copyTree(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = (await fs.readdir(src, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      await copyTree(s, d);
    } else {
      await fs.copyFile(s, d);
      await fs.utimes(d, FIXED_MTIME, FIXED_MTIME);
    }
  }
}

/** Registry de targets (M1/M10). No spike: apenas windows-installer. */
export const targets: Record<string, TargetAdapter> = {};