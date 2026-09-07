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
  /** Versão do electron-builder usado (informação do relatório). */
  electronBuilderVersion?: string;
}

/** Modos de artefato (RF3): executável standalone ou instalador. */
export type TargetMode = "standalone" | "installer";

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
  /** Callback opcional de log (CLI/CI exibem a saída dos bundlers). */
  log?: (msg: string) => void;
}

/**
 * Contrato de um target adapter (ADR-1/§7 do ARQUITETURA.md).
 * O core não conhece plataformas: cada alvo registra um adapter (RF2/M10).
 */
export interface TargetAdapter {
  id: string;
  /** Modo de artefato atendido pelo target (RF3). */
  mode: TargetMode;
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

// ── Registry de targets (RF2 / M10) ──────────────────────────────────

const registry = new Map<string, TargetAdapter>();

/** Registra um target adapter (chamado pelo CLI/testes que importam os packages). */
export function registerTarget(target: TargetAdapter): void {
  registry.set(target.id, target);
}

/** Busca um target pelo id (ex.: `--target=windows-standalone`). */
export function getTarget(id: string): TargetAdapter {
  const target = registry.get(id);
  if (!target) {
    throw new Error(
      `[registry] target '${id}' não registrado. Registrados: ${[...registry.keys()].join(", ") || "(nenhum)"}`,
    );
  }
  return target;
}

/** Targets registrados (para diagnóstico do CLI). */
export function registeredTargets(): TargetAdapter[] {
  return [...registry.values()];
}

/** RF2: escolhe o target a partir do modo do manifest (Windows por padrão). */
export function resolveTarget(manifest: Pick<Manifest, "mode">): TargetAdapter {
  const matches = registeredTargets().filter((t) => t.mode === manifest.mode);
  if (matches.length === 0) {
    throw new Error(
      `[registry] nenhum target registrado para o modo '${manifest.mode}' (RF2). ` +
        `Registrados: ${[...registry.keys()].join(", ") || "(nenhum)"}`,
    );
  }
  return matches[0];
}

/**
 * Esqueleto do pipeline: input → normalize → stage → stamp → render → bundle → verify → output.
 * Cada stage é uma função pura sobre `ctx`; o pipeline orquestra a ordem e os diretórios.
 */
export async function runPipeline(ctx: BuildContext): Promise<BuildReport> {
  const { manifest } = ctx;

  // 1. input — detecta e valida a entrada (pasta ou zip; zip extrai em workDir/input)
  const input = await runInput(manifest, ctx.baseDir, {
    extractDir: path.join(ctx.workDir, "input"),
  });

  // 2. normalize — reescreve assets absolutos p/ relativos
  const normalizeDir = path.join(ctx.workDir, "normalize");
  await runNormalize(input, manifest, normalizeDir);

  // 3. stage — cópia determinística (incremental entra no tuning da Iteração 4)
  const stageDir = path.join(ctx.workDir, "stage");
  await copyTree(normalizeDir, stageDir);

  // 4. stamp — injeta metadados no entry point
  await runStamp(stageDir, manifest, input.fingerprint);

  // 5. render — o target gera o que lhe cabe (páginas NSIS, recursos, config do bundler)
  await ctx.target.render(ctx, input);

  // 6. bundle — compilador/bundler produz o artefato
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
    style: ctx.styleOverride ?? "—",
    artifact: { ...artifact, path: finalArtifactPath },
    integrity,
    inputFingerprint: input.fingerprint,
  };
}

/**
 * Cópia recursiva simples e determinística (ordem estável + mtime fixo).
 * makensis e o empacotamento do electron-builder embutem mtimes dos arquivos
 * no artefato; sem mtime fixo, dois builds da mesma entrada geram hashes diferentes.
 */
const FIXED_MTIME = new Date("2024-01-01T00:00:00Z");

export async function copyTree(src: string, dest: string): Promise<void> {
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
