import { describe, expect, it } from "vitest";
import { manifestSchema, PROGRESS_STYLES, progressStyleSchema } from "@toskintaller/config";

const baseManifest = {
  schemaVersion: 1,
  app: { id: "br.lab.test", name: "Test App", version: "1.0.0", publisher: "ToskeraLAB" },
  input: { type: "folder", path: ".", entry: "index.html" },
  mode: "installer",
  artifact: { outDir: "./release", fileName: "TestApp-Setup-1.0.0" },
};

describe("manifest schema", () => {
  it("aceita um manifest mínimo com defaults", () => {
    const parsed = manifestSchema.parse(baseManifest);
    expect(parsed.installScreen.progress.style).toBe("smooth");
    expect(parsed.installer.targetDir).toBe("%LOCALAPPDATA%");
    expect(parsed.installer.silentFlags.install).toBe("/S");
  });

  it("rejeita manifest sem fileName", () => {
    expect(() =>
      manifestSchema.parse({ ...baseManifest, artifact: { outDir: "./release" } }),
    ).toThrow();
  });

  it("rejeita estilo de progresso fora da lista S0.4", () => {
    expect(progressStyleSchema.safeParse("html").success).toBe(false);
    expect(progressStyleSchema.safeParse("framer-motion").success).toBe(false);
  });

  it("aceita os 5 estilos simples da decisão S0.4 (2 a 5 estilos)", () => {
    expect(PROGRESS_STYLES).toHaveLength(5);
    for (const s of PROGRESS_STYLES) {
      expect(progressStyleSchema.safeParse(s).success).toBe(true);
    }
  });
});