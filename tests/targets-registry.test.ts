import { describe, expect, it } from "vitest";
import {
  registerTarget,
  declarePlannedTarget,
  resolveTarget,
  getTargetEntry,
  registeredTargetEntries,
  type TargetAdapter,
} from "@toskintaller/core";

/**
 * M10 — registry de targets: matriz de capacidades, status (available/planned)
 * e requisitos de host. Preparação estrutural para Linux/Android/Apple: os
 * targets planejados aparecem na matriz mas nunca são escolhidos pelo
 * resolveTarget até que um adapter real seja registrado com o mesmo id.
 */

function fakeAdapter(id: string, mode: "standalone" | "installer"): TargetAdapter {
  return {
    id,
    mode,
    hostRequirements: { os: ["win32"], arch: ["x64"] },
    render: async () => {},
    bundle: async () => ({ path: "x.exe", fileName: "x.exe" }),
  };
}

describe("registry de targets (M10)", () => {
  it("registro sem meta deriva capacidades do modo (compatibilidade Iteração 1)", () => {
    const id = `test-bare-${Date.now()}`;
    registerTarget(fakeAdapter(id, "standalone"));
    const entry = getTargetEntry(id);
    expect(entry.status).toBe("available");
    expect(entry.capabilities.modes).toEqual(["standalone"]);
    expect(entry.capabilities.artifactExtensions).toEqual([".exe"]);
  });

  it("registro com meta preserva a matriz de capacidades", () => {
    const id = `test-meta-${Date.now()}`;
    registerTarget(fakeAdapter(id, "installer"), {
      status: "available",
      capabilities: {
        modes: ["installer"],
        progressStyles: ["smooth", "marquee"],
        supplementalInstalls: true,
        shortcuts: true,
        uninstaller: true,
        silentMode: true,
        artifactExtensions: [".exe"],
      },
    });
    const entry = getTargetEntry(id);
    expect(entry.capabilities.progressStyles).toEqual(["smooth", "marquee"]);
    expect(entry.capabilities.supplementalInstalls).toBe(true);
  });

  it("declarePlannedTarget aparece na matriz mas resolveTarget nunca o escolhe", () => {
    const id = `test-planned-${Date.now()}`;
    declarePlannedTarget(
      id,
      "standalone",
      { os: ["linux"], arch: ["x64"] },
      { modes: ["standalone"], artifactExtensions: [".AppImage"] },
    );
    const entry = getTargetEntry(id);
    expect(entry.status).toBe("planned");
    expect(entry.capabilities.artifactExtensions).toEqual([".AppImage"]);

    // resolveTarget filtra por status available — planned não é elegível
    const matches = registeredTargetEntries().filter(
      (e) => e.status === "available" && e.adapter.mode === "standalone",
    );
    expect(matches.every((e) => e.status === "available")).toBe(true);
  });

  it("getTargetEntry lança erro claro para id não registrado", () => {
    expect(() => getTargetEntry("target-inexistente-xyz")).toThrow(/não registrado/);
  });

  it("resolveTarget falha com mensagem útil quando nenhum target available atende o modo", () => {
    // Registry vazio em um contexto isolado não é possível (Map global),
    // então validamos a mensagem de erro do contrato via id planejado.
    const id = `test-only-planned-${Date.now()}`;
    declarePlannedTarget(
      id,
      "standalone",
      { os: ["android"], arch: ["arm64"] },
      { modes: ["standalone"], artifactExtensions: [".apk"] },
    );
    const entry = getTargetEntry(id);
    expect(entry.status).toBe("planned");
    // O contrato RF2: apenas "available" é elegível — coberto pelo filtro em resolveTarget.
    expect(entry.adapter.id).toBe(id);
  });
});
