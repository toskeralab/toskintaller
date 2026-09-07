import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

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