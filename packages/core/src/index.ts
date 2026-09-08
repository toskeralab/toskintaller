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

/**
 * M10 — Matriz de capacidades e status de um target no registry.
 * Preparação estrutural para Linux/Android/Apple: novos adapters declaram
 * capabilities/status aqui, sem alterar o pipeline (que continua chamando
 * apenas render/bundle).
 */
export type TargetStatus = "available" | "planned";

export interface TargetCapabilities {
  /** Modos de artefato suportados (RF3). */
  modes: TargetMode[];
  /** Estilos de progresso suportados quando o target gera instalador com tela custom (S0.4). */
  progressStyles?: string[];
  /** Suporta instalações complementares (RF4). */
  supplementalInstalls?: boolean;
  /** Suporta atalhos (Start Menu/Desktop) — instaladores. */
  shortcuts?: boolean;
  /** Suporta desinstalador — instaladores. */
  uninstaller?: boolean;
  /** Suporta silent mode (flags /S). */
  silentMode?: boolean;
  /** Extensões dos artefatos produzidos. */
  artifactExtensions: string[];
}

/** Entrada estendida no registry (M10): adapter + metadados de capacidade. */
export interface TargetRegistryEntry {
  adapter: TargetAdapter;
  /** "available" (funciona hoje) ou "planned" (estrutura preparada, adapter futuro). */
  status: TargetStatus;
  capabilities: TargetCapabilities;
}

/** Relatório final do pipeline. */
export interface BuildReport {
  target: string;
  style: string;
  artifact: Artifact;
  integrity: Record<string, string>;
  inputFingerprint: string;
}

// ── Registry de targets (RF2 / M10) ──────────────────────────────

const registry = new Map<string, TargetRegistryEntry>();

/**
 * Registra um target adapter com sua matriz de capacidades (M10).
 * Compatível com chamadas antigas: sem meta, capacidades são derivadas do modo.
 */
export function registerTarget(target: TargetAdapter, meta?: Omit<TargetRegistryEntry, "adapter">): void {
  registry.set(target.id, {
    adapter: target,
    status: meta?.status ?? "available",
    capabilities: meta?.capabilities ?? {
      modes: [target.mode],
      artifactExtensions: [".exe"],
    },
  });
}

/** Busca a entrada completa do registry pelo id (adapter + capacidades). */
export function getTargetEntry(id: string): TargetRegistryEntry {
  const entry = registry.get(id);
  if (!entry) {
    throw new Error(
      `[registry] target '${id}' não registrado. Registrados: ${[...registry.keys()].join(', ') || '(nenhum)'}`,
    );
  }
  return entry;
}

/** Busca um target pelo id (ex.: --target=windows-standalone). */
export function getTarget(id: string): TargetAdapter {
  return getTargetEntry(id).adapter;
}

/** Targets registrados (para diagnóstico do CLI). */
export function registeredTargets(): TargetAdapter[] {
  return [...registry.values()].map((e) => e.adapter);
}

/** Entradas completas do registry (M10 — matriz de capacidades). */
export function registeredTargetEntries(): TargetRegistryEntry[] {
  return [...registry.values()];
}

/**
 * M10 — Declara um target planejado (Linux/Android/Apple) SEM adapter real.
 * Aparece na matriz de capacidades do CLI (`toskintaller targets`) como "planned";
 * `resolveTarget` nunca o escolhe. Quando o adapter for implementado (Iteração 5),
 * basta registrar com registerTarget(adapter, meta) usando o mesmo id.
 */
export function declarePlannedTarget(
  id: string,
  mode: TargetMode,
  hostRequirements: { os: string[]; arch: string[] },
  capabilities: TargetCapabilities,
): void {
  registry.set(id, { adapter: { id, mode, hostRequirements, render: notImplemented, bundle: notImplemented }, status: "planned", capabilities });
}

function notImplemented(): Promise<never> {
  return Promise.reject(new Error("[registry] target planejado: adapter ainda não implementado (Iteração 5)"));
}

/** RF2: escolhe o target a partir do modo do manifest (Windows por padrão). */
export function resolveTarget(manifest: Pick<Manifest, "mode">): TargetAdapter {
  const matches = registeredTargetEntries().filter(
    (e) => e.status === "available" && e.adapter.mode === manifest.mode,
  );
  if (matches.length === 0) {
    throw new Error(
      `[registry] nenhum target disponível para o modo '${manifest.mode}' (RF2). ` +
        `Registrados: ${[...registry.keys()].join(", ") || "(nenhum)"}`,
    );
  }
  return matches[0].adapter;
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

  // 3. stage — cópia determinística com paralelismo limitado (tuning Iteração 4)
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
 * Cópia recursiva determinística (ordem estável + mtime fixo).
 * makensis e o empacotamento do electron-builder embutem mtimes dos arquivos
 * no artefato; sem mtime fixo, dois builds da mesma entrada geram hashes diferentes.
 *
 * Hardening (Iteração 4): a cópia dos ARQUIVOS roda em paralelo com concorrência
 * limitada (mapLimit). O determinismo não depende da ordem de cópia: conteúdo é
 * idêntico e o mtime é fixo — o empacotador (makensis/asar) ordena por conta dele.
 */
const FIXED_MTIME = new Date("2024-01-01T00:00:00Z");

/** Concorrência da cópia: alta o bastante para saturar I/O, baixa o bastante para
 * não esgotar file descriptors em árvores grandes (tuning Iteração 4). */
const COPY_CONCURRENCY = 16;

/** Executa `fn` sobre cada item com no máximo `limit` promessas em voo (ordem de
 * resultados preservada; erros propagam após todas as tarefas em voo assentarem). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function copyTree(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = (await fs.readdir(src, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const files = entries.filter((e) => !e.isDirectory());
  // Diretórios primeiro (sequencial, cria a árvore de destino)…
  for (const e of entries) {
    if (e.isDirectory()) {
      await copyTree(path.join(src, e.name), path.join(dest, e.name));
    }
  }
  // …depois todos os arquivos deste nível em paralelo limitado.
  await mapLimit(files, COPY_CONCURRENCY, async (e) => {
    const d = path.join(dest, e.name);
    await fs.copyFile(path.join(src, e.name), d);
    await fs.utimes(d, FIXED_MTIME, FIXED_MTIME);
  });
}
