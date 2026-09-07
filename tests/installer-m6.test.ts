import { describe, expect, it } from "vitest";
import { manifestSchema } from "@toskintaller/config";
import { generateNsisScript } from "@toskintaller/installer-nsis";
import { promises as fs } from "node:fs";
import path from "node:path";

describe("installer M6 — generator contract", () => {
  it("renderiza textos, banner, progresso S0.4 e pagina finish", async () => {
    const manifest = manifestSchema.parse({
      schemaVersion: 1,
      app: { id: "br.lab.testem", name: "Test App", version: "1.0.0" },
      input: { type: "folder", path: ".", entry: "index.html" },
      mode: "installer",
      installScreen: {
        title: "Instalando Test App",
        subtitle: "Versão de teste",
        footer: "ToskeraLAB",
        banner: { type: "gradient" },
        progress: { style: "smooth" },
        supplemental: [
          {
            id: "redist",
            label: "Instalar VC++ Redist",
            file: "redist/vcredist_x64.exe",
            silentArgs: "/quiet /norestart",
            required: true,
            defaultChecked: true,
          },
        ],
        finish: {
          title: "Instalação concluída",
          message: "Agora você pode usar o app.",
          runAfterInstall: true,
        },
      },
      installer: {
        targetDir: "%LOCALAPPDATA%",
        shortcuts: ["startMenu", "desktop"],
        uninstaller: true,
        silentFlags: { install: "/S", uninstall: "/S" },
      },
      artifact: { outDir: "./release", fileName: "TestApp-Setup-1.0.0" },
    });

    const stageDir = path.resolve("tests/fixtures/m6-stage");
    await fs.mkdir(stageDir, { recursive: true });
    await fs.writeFile(path.join(stageDir, "index.html"), "<html></html>", "utf8");
    const nsi = generateNsisScript({
      manifest,
      stageDir,
      files: ["index.html"],
      bannerSrc: path.join(stageDir, "banner.bmp"),
      outFile: path.join(stageDir, "out.exe"),
    });

    expect(nsi).toContain("Instalando Test App");
    expect(nsi).toContain("Versão de teste");
    expect(nsi).toContain("ToskeraLAB");
    expect(nsi).toContain("NSD_CreateProgressBar");
    expect(nsi).toContain("Page custom InstallScreenCreate InstallScreenLeave");
    expect(nsi).toContain("Page custom FinishPageCreate FinishPageLeave");
    expect(nsi).toContain("Function FinishPageCreate");
    expect(nsi).toContain("MessageBox MB_OK|MB_ICONSTOP");
  });
});
