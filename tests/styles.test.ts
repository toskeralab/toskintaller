import { describe, expect, it } from "vitest";
import { PROGRESS_STYLES } from "@toskintaller/config";
import { styleFragments } from "@toskintaller/installer-nsis";

describe("estilos NSIS (S0.4)", () => {
  it("gera um fragmento para cada um dos 5 estilos", () => {
    for (const style of PROGRESS_STYLES) {
      const frag = styleFragments(style);
      expect(frag.controls.length).toBeGreaterThan(0);
    }
  });

  it("smooth: barra determinada com timer", () => {
    const frag = styleFragments("smooth");
    expect(frag.usesTimer).toBe(true);
    expect(frag.controls).toContain("NSD_CreateProgressBar");
    expect(frag.controls).toContain("NSD_CreateTimer");
    expect(frag.tick).toContain("PBM_SETPOS");
  });

  it("marquee: barra indeterminada sem timer", () => {
    const frag = styleFragments("marquee");
    expect(frag.usesTimer).toBe(false);
    expect(frag.controls).toContain("PBM_SETMARQUEE");
  });

  it("pulse: oscila 0→100→0 com direção", () => {
    const frag = styleFragments("pulse");
    expect(frag.usesTimer).toBe(true);
    expect(frag.tick).toContain("$DIR");
    expect(frag.tick).toContain("PBM_SETPOS");
  });

  it("bars: três segmentos sequenciais", () => {
    const frag = styleFragments("bars");
    expect(frag.controls).toContain("$PROGRESS2");
    expect(frag.controls).toContain("$PROGRESS3");
    expect(frag.tick).toContain("300");
  });

  it("dots: texto animado via timer", () => {
    const frag = styleFragments("dots");
    expect(frag.usesTimer).toBe(true);
    expect(frag.controls).toContain("NSD_CreateLabel");
    expect(frag.tick).toContain("NSD_SetText");
    expect(frag.tick).toContain("Instalando...");
  });
});