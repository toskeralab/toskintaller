import type { Manifest } from "@toskintaller/config";
import { styleFragments } from "./styles.ts";

export interface NsisRenderInput {
  manifest: Manifest;
  /** Caminho absoluto da pasta stage (app normalizado + stampado). */
  stageDir: string;
  /** Arquivos relativos do stage, em ordem alfabética (ordem determinística de empacotamento). */
  files: string[];
  /** Caminho absoluto do banner.bmp gerado. */
  bannerSrc: string;
  /** Caminho absoluto do .exe de saída. */
  outFile: string;
}

/** Escapa aspas duplas em strings NSIS. */
function q(s: string): string {
  return s.replace(/"/g, '""');
}

/**
 * Gera o script NSIS completo. A página custom prova S0.4:
 * banner + textos + barra de progresso (estilo do manifest) + checkbox
 * de instalação complementar; a seção de instalação executa complementares
 * com flags silenciosas e grava o desinstalador.
 */
export function generateNsisScript(input: NsisRenderInput): string {
  const { manifest } = input;
  const screen = manifest.installScreen;
  const style = styleFragments(screen.progress.style);
  const installDir = `${manifest.installer.targetDir}\\${manifest.app.name}`;
  const supplemental = screen.supplemental[0]; // spike: suporta 1 complementar
  const outFileName = `${manifest.artifact.fileName}.exe`;

  const sections: string[] = [];
  sections.push(`Section "Install"
  SetOutPath "$INSTDIR"
  ; um File por arquivo, em ordem alfabética → ordem de empacotamento determinística
${input.files.map((f) => `  File "/oname=${f}" "../stage/${f}"`).join("\n")}`);
  if (supplemental) {
    sections.push(`  \${If} $SUPP_STATE == \${BST_CHECKED}
    \${If} \${FileExists} "$INSTDIR\\${supplemental.file}"
      ExecWait '"$INSTDIR\\${supplemental.file}" ${supplemental.silentArgs}'
    \${EndIf}
  \${EndIf}`);
  }
  if (manifest.installer.uninstaller) {
    sections.push(`  WriteUninstaller "$INSTDIR\\Uninstall.exe"`);
  }
  sections.push(`SectionEnd`);

  sections.push(`Section "Uninstall"
  RMDir /r "$INSTDIR"
SectionEnd`);

  const tickFunction = style.tick
    ? `
Function OnTick
${style.tick}
FunctionEnd`
    : "";

  const killTimer = style.usesTimer ? `  \${NSD_KillTimer} OnTick` : "";

  return `; Toskinstaller spike — gerado a partir do manifest (determinístico)
Unicode true
XPStyle on
RequestExecutionLevel user
Name "${q(manifest.app.name)}"
OutFile "../bundle/${outFileName}"
InstallDir "${q(installDir)}"
SetCompressor /SOLID lzma

!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!define PBS_SMOOTH 0x01
!define PBS_MARQUEE 0x08

Var DIALOG
Var TITLE_LBL
Var SUBTITLE_LBL
Var BANNER
Var PROGRESS
Var PROGRESS2
Var PROGRESS3
Var DOTS_LBL
Var SUPP_CHECK
Var SUPP_STATE
Var TICK
Var DIR

Function .onInit
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "banner.bmp"
FunctionEnd

Page custom InstallScreenCreate InstallScreenLeave
Page instfiles

Function InstallScreenCreate
  nsDialogs::Create 1018
  Pop $DIALOG
  \${If} $DIALOG == error
    Abort
  \${EndIf}

  \${NSD_CreateLabel} 0 0 100% 12u "${q(screen.title)}"
  Pop $TITLE_LBL

  \${NSD_CreateLabel} 0 13u 100% 10u "${q(screen.subtitle)}"
  Pop $SUBTITLE_LBL

  \${NSD_CreateBitmap} 0 26u 100% 30u ""
  Pop $BANNER
  \${NSD_SetStretchedBitmap} $BANNER "$PLUGINSDIR\\banner.bmp" $0
${style.controls}

  \${NSD_CreateLabel} 0 94u 100% 10u "${q(screen.footer)}"
  Pop $0
${supplementalCheckbox(supplemental)}

  nsDialogs::Show
FunctionEnd

Function InstallScreenLeave
  \${NSD_GetState} $SUPP_CHECK $SUPP_STATE
${killTimer}
FunctionEnd
${tickFunction}
${sections.join("\n")}
`;
}

function supplementalCheckbox(supplemental: { label: string } | undefined): string {
  if (!supplemental) {
    return `  ; sem instalações complementares configuradas`;
  }
  return `  \${NSD_CreateCheckBox} 0 106u 100% 10u "${q(supplemental.label)}"
  Pop $SUPP_CHECK
  \${NSD_Check} $SUPP_CHECK`;
}