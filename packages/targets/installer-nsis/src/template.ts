import type { Manifest } from "@toskintaller/config";
import { styleFragments } from "./styles";

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

function footerY(count: number): string {
  return count === 0 ? "94u" : `${94 + count * 12}u`;
}

function checkVarName(i: number): string {
  return i === 0 ? "SUPP_CHECK0" : `SUPP_CHECK${i}`;
}

function stateVarName(i: number): string {
  return i === 0 ? "SUPP_STATE0" : `SUPP_STATE${i}`;
}

/** NSIS macro de verificação de checkbox. */
const BST_CHECKED = "${BST_CHECKED}";

/**
 * Gera o script NSIS completo.
 * Base funcional do spike (S0.4) + M6.
 */
export function generateNsisScript(input: NsisRenderInput): string {
  const { manifest } = input;
  const screen = manifest.installScreen;
  const style = styleFragments(screen.progress.style);
  const installDir = `${manifest.installer.targetDir}\\${manifest.app.name}`;
  const outFileName = `${manifest.artifact.fileName}.exe`;
  const appName = manifest.app.name;

  const varLines: string[] = [
    "Var DIALOG",
    "Var TITLE_LBL",
    "Var SUBTITLE_LBL",
    "Var BANNER",
    "Var PROGRESS",
    "Var PROGRESS2",
    "Var PROGRESS3",
    "Var DOTS_LBL",
    "Var TICK",
    "Var DIR",
  ];

  for (let i = 0; i < screen.supplemental.length; i++) {
    varLines.push(`Var ${checkVarName(i)}`);
    varLines.push(`Var ${stateVarName(i)}`);
  }

  if (manifest.mode === "installer" && screen.finish.runAfterInstall) {
    varLines.push("Var MSG_LBL");
    varLines.push("Var RUN_BTN");
  }

  const installScreenLines: string[] = [
    "Function InstallScreenCreate",
    "  nsDialogs::Create 1018",
    "  Pop $DIALOG",
    `  ${"${"}If} $DIALOG == error`,
    "    Abort",
    `  ${"${"}EndIf}`,
    `  ${"${"}NSD_CreateLabel} 0 0 100% 12u "${q(screen.title)}"`,
    "  Pop $TITLE_LBL",
    `  ${"${"}NSD_CreateLabel} 0 13u 100% 10u "${q(screen.subtitle)}"`,
    "  Pop $SUBTITLE_LBL",
    `  ${"${"}NSD_CreateBitmap} 0 26u 100% 30u ""`,
    "  Pop $BANNER",
    `  ${"${"}NSD_SetStretchedBitmap} $BANNER "$PLUGINSDIR\\banner.bmp" $0`,
    style.controls,
    `  ${"${"}NSD_CreateLabel} 0 ${94 + screen.supplemental.length * 12}u 100% 10u "${q(screen.footer)}"`,
    "  Pop $0",
  ];

  screen.supplemental.forEach((s, i) => {
    const y = 106 + i * 12;
    installScreenLines.push(
      `  ${"${"}NSD_CreateCheckBox} 0 ${y}u 100% 10u "${q(s.label)}"`
    );
    installScreenLines.push(`  Pop $${checkVarName(i)}`);
    if (s.defaultChecked) {
      installScreenLines.push(`  ${"${"}NSD_Check} $${checkVarName(i)}`);
    }
  });

  installScreenLines.push("  nsDialogs::Show");
  installScreenLines.push("FunctionEnd");

  const installScreenLeaveLines: string[] = ["Function InstallScreenLeave"];
  screen.supplemental.forEach((_, i) => {
    installScreenLeaveLines.push(
      `  ${"${"}NSD_GetState} $${checkVarName(i)} $${stateVarName(i)}`
    );
  });
  if (style.usesTimer) {
    installScreenLeaveLines.push(`  ${"${"}NSD_KillTimer} OnTick`);
  }
  installScreenLeaveLines.push("FunctionEnd");

  const sections: string[] = [];
  sections.push(`Section "Install"`);
  sections.push(`  SetOutPath "$INSTDIR"`);
  sections.push(`  ; um File por arquivo, em ordem alfabética → ordem de empacotamento determinística`);
  sections.push(input.files.map((f) => `  File "/oname=${f}" "../stage/${f}"`).join("\n"));

  screen.supplemental.forEach((s, i) => {
    const checkVar = `$${checkVarName(i)}`;
    sections.push(`  ${"${"}If} ${checkVar} == ${BST_CHECKED}`);
    sections.push(`    ${"${"}If} ${"${"}FileExists} \"$INSTDIR\\${s.file}\"`);
    sections.push(`      ExecWait '"$INSTDIR\\${s.file}" ${q(s.silentArgs)}'`);
    if (s.required) {      sections.push(`    ${"${"}Else}`);
      sections.push(`      MessageBox MB_OK|MB_ICONSTOP \"Instalação abortada: ${q(s.label)} não encontrado.\"`);
      sections.push(`      Abort`);
      sections.push(`    ${"${"}EndIf}`);
    } else {
      sections.push(`    ${"${"}EndIf}`);
    }
    sections.push(`  ${"${"}EndIf}`);
  });

  if (manifest.installer.uninstaller) {
    sections.push(`  WriteUninstaller "$INSTDIR\\Uninstall.exe"`);
  }
  sections.push(`SectionEnd`);

  sections.push(`Section "Uninstall"`);
  sections.push(`  RMDir /r "$INSTDIR"`);
  sections.push(`SectionEnd`);

  if (manifest.installer.shortcuts.length > 0) {
    sections.push(`Section -Post`);
    const startMenuName = q(`${appName} (${manifest.app.version})`);
    const exeName = `${appName}.exe`;
    const uninstallerPath = `"$INSTDIR\\Uninstall.exe"`;

    if (manifest.installer.shortcuts.includes("startMenu")) {
      sections.push(`  CreateDirectory "$SMPROGRAMS\\${startMenuName}"`);
      sections.push(
        `  CreateShortCut "$SMPROGRAMS\\${startMenuName}\\${q(appName)}.lnk" "$INSTDIR\\${exeName}" "" "$INSTDIR\\${exeName}" 0`
      );
      if (manifest.installer.uninstaller) {
        sections.push(
          `  CreateShortCut "$SMPROGRAMS\\${startMenuName}\\Desinstalar.lnk" ${uninstallerPath} "" ${uninstallerPath} 0`
        );
      }
    }

    if (manifest.installer.shortcuts.includes("desktop")) {
      sections.push(
        `  CreateShortCut "$DESKTOP\\${q(`${appName}.lnk`)}" "$INSTDIR\\${exeName}" "" "$INSTDIR\\${exeName}" 0`
      );
    }

    sections.push(`SectionEnd`);
  }

  const tickFunction = style.tick
    ? `\nFunction OnTick\n${style.tick}\nFunctionEnd`
    : "";

  const finishPageBlock =
    manifest.mode === "installer" && screen.finish.runAfterInstall
      ? `
Page custom FinishPageCreate FinishPageLeave
Function FinishPageCreate
  nsDialogs::Create 1018
  Pop $DIALOG
  ${"${"}If} $DIALOG == error
    Abort
  ${"${"}EndIf}
  ${"${"}NSD_CreateLabel} 0 0 100% 12u "${q(screen.finish.title)}"
  Pop $TITLE_LBL
  ${"${"}NSD_CreateLabel} 0 14u 100% 10u "${q(screen.finish.message)}"
  Pop $MSG_LBL
  ${"${"}NSD_CreateButton} 0 104u 100% 10u "${q("Abrir app")}"
  Pop $RUN_BTN
  ${"${"}NSD_OnClick} $RUN_BTN LaunchApp
  nsDialogs::Show
FunctionEnd
Function FinishPageLeave
FunctionEnd
Function LaunchApp
  ClearErrors
  ExecShell "open" "$INSTDIR\\${q(`${appName}.exe`)}"
FunctionEnd`
      : "";

  const pipelineSectionPages =
    manifest.mode === "installer" && screen.finish.runAfterInstall
      ? "Page custom FinishPageCreate FinishPageLeave"
      : "";

  return `; Toskinstaller — gerado a partir do manifest (determinístico)
Unicode true
XPStyle on
RequestExecutionLevel user
Name "${q(appName)}"
OutFile "../bundle/${outFileName}"
InstallDir "${q(installDir)}"
SetCompressor /SOLID lzma

!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"
!include "FileFunc.nsh"

!define PBS_SMOOTH 0x01
!define PBS_MARQUEE 0x08

${varLines.join("\n")}

Function .onInit
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "banner.bmp"
FunctionEnd

Page custom InstallScreenCreate InstallScreenLeave
Page instfiles
${pipelineSectionPages}

${installScreenLines.join("\n")}
${installScreenLeaveLines.join("\n")}
${tickFunction}
${sections.join("\n")}
${finishPageBlock}
`;
}
