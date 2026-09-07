import { promises as fs, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
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
