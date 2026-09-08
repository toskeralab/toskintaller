import { promises as fs, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: string | Buffer) => h.update(chunk));
    stream.on("end", () => resolve(h.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Stage `verify`: calcula o sha256 do artefato e escreve o manifest de integridade.
 * Retorna o mapa de checksums (nome do arquivo → hash).
 */
export async function writeIntegrityManifest(
  artifactPath: string,
  outDir: string,
): Promise<Record<string, string>> {
  await fs.mkdir(outDir, { recursive: true });
  const hash = await sha256File(artifactPath);
  const integrity = {
    [path.basename(artifactPath)]: hash,
  };
  await fs.writeFile(
    path.join(outDir, "integrity.json"),
    JSON.stringify({ algorithm: "sha256", files: integrity }, null, 2),
  );
  return integrity;
}

/**
 * Dumps a sorted manifest of the given directory's files (relative paths → sha256).
 * Used by CIR to surface reproducibility and by the standalone target to surface what
 * was packed.
 */
export async function writeFileManifest(
  dir: string,
  outPath: string,
): Promise<Record<string, string>> {
  const files = await listFiles(dir);
  const manifest: Record<string, string> = {};
  for (const rel of files) {
    manifest[rel] = await sha256File(path.join(dir, rel));
  }
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(
    outPath,
    JSON.stringify({ algorithm: "sha256", files: manifest }, null, 2),
    "utf8",
  );
  return manifest;
}

/** Lista arquivos relativos de um diretório. */
async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string, rel: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (e.isDirectory()) {
        await walk(path.join(current, e.name), rel ? `${rel}/${e.name}` : e.name);
      } else {
        out.push(rel ? `${rel}/${e.name}` : e.name);
      }
    }
  }
  await walk(dir, "");
  return out;
}

// ── M9: suíte verify completa (smoke, reprodutibilidade, relatório) ──────────

/** Resultado de um smoke executado sobre um artefato. */
export interface SmokeResult {
  /** Nome do smoke executado (ex.: "boot", "silent-install"). */
  name: string;
  /** Passou ou não. */
  passed: boolean;
  /** Detalhe da falha ou do skip, quando houver. */
  error?: string;
  /** Duração em ms. */
  durationMs: number;
}

/** Resultado da checagem de reprodutibilidade entre dois builds. */
export interface ReproducibilityResult {
  passed: boolean;
  hashA: string;
  hashB: string;
}

/** Relatório final da suíte verify (M9). */
export interface VerifyReport {
  artifact: string;
  sha256: string;
  smokes: SmokeResult[];
  reproducibility?: ReproducibilityResult;
  /** true se todos os smokes (e a reprodutibilidade, quando executada) passaram. */
  ok: boolean;
  /** Timestamp ISO do relatório. */
  generatedAt: string;
}

/**
 * Smoke de boot do .exe standalone.
 *
 * Valida a integridade estrutural do binário (assinatura PE "MZ" + tamanho
 * plausível). O boot real do Electron em janela é validado pelo CI Windows
 * (job windows) e pelo smoke de instalação; em hosts não-Windows este smoke
 * cobre a parte que não depende de GUI.
 */
export async function smokeBootExe(artifactPath: string): Promise<SmokeResult> {
  const start = Date.now();
  try {
    const head = Buffer.alloc(2);
    const fh = await fs.open(artifactPath, "r");
    await fh.read(head, 0, 2, 0);
    await fh.close();
    if (head.toString("ascii") !== "MZ") {
      return {
        name: "boot",
        passed: false,
        error: "artefato não é um PE válido (sem assinatura MZ)",
        durationMs: Date.now() - start,
      };
    }
    const stat = await fs.stat(artifactPath);
    if (stat.size < 1_000_000) {
      return {
        name: "boot",
        passed: false,
        error: `artefato suspeito de ${stat.size} bytes`,
        durationMs: Date.now() - start,
      };
    }
    return { name: "boot", passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name: "boot", passed: false, error: (e as Error).message, durationMs: Date.now() - start };
  }
}

/**
 * Smoke de instalação silenciosa (RF3 modo 2, só faz sentido em Windows):
 * roda o instalador com /S e confere que o arquivo esperado foi instalado.
 * Em hosts não-Windows retorna passed=true com detalhe "skipped" — a validação
 * real fica no CI windows-latest (ver .github/workflows/build-windows.yml).
 */
export async function smokeSilentInstall(
  artifactPath: string,
  expectedFile: string,
  timeoutMs = 60_000,
): Promise<SmokeResult> {
  const start = Date.now();
  if (process.platform !== "win32") {
    return {
      name: "silent-install",
      passed: true,
      error: "skipped: requer Windows (validado pelo CI windows-latest)",
      durationMs: Date.now() - start,
    };
  }
  return new Promise((resolve) => {
    const child = spawn(artifactPath, ["/S"], { stdio: "ignore", shell: true });
    const timer = setTimeout(() => {
      child.kill();
      resolve({
        name: "silent-install",
        passed: false,
        error: `timeout de ${timeoutMs}ms`,
        durationMs: Date.now() - start,
      });
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ name: "silent-install", passed: false, error: `exit ${code}`, durationMs: Date.now() - start });
        return;
      }
      fs.access(expectedFile)
        .then(() => resolve({ name: "silent-install", passed: true, durationMs: Date.now() - start }))
        .catch((e) =>
          resolve({
            name: "silent-install",
            passed: false,
            error: `arquivo esperado não instalado: ${(e as Error).message}`,
            durationMs: Date.now() - start,
          }),
        );
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ name: "silent-install", passed: false, error: e.message, durationMs: Date.now() - start });
    });
  });
}

/**
 * Checagem de reprodutibilidade (DoD): dois builds independentes da mesma
 * entrada produzem artefatos byte-idênticos → mesmos hashes.
 */
export function checkReproducibility(hashA: string, hashB: string): ReproducibilityResult {
  return { passed: hashA === hashB, hashA, hashB };
}

/** Grava o relatório JSON da suíte verify. */
export async function writeVerifyReport(report: VerifyReport, outPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
}
