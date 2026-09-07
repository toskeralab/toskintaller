; Toskinstaller spike — gerado a partir do manifest (determinístico)
Unicode true
XPStyle on
RequestExecutionLevel user
Name "Example App"
OutFile "../bundle/ExampleApp-Setup-1.0.0.exe"
InstallDir "%LOCALAPPDATA%\Example App"
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
  ${If} $DIALOG == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 12u "Instalando Example App"
  Pop $TITLE_LBL

  ${NSD_CreateLabel} 0 13u 100% 10u "Feito com Freebuff · ToskeraLAB"
  Pop $SUBTITLE_LBL

  ${NSD_CreateBitmap} 0 26u 100% 30u ""
  Pop $BANNER
  ${NSD_SetStretchedBitmap} $BANNER "$PLUGINSDIR\banner.bmp" $0
; [bars] 3 segmentos preenchendo em sequência
  ${NSD_CreateProgressBar} 0 60u 100% 8u ""
  Pop $PROGRESS
  ${NSD_CreateProgressBar} 0 70u 100% 8u ""
  Pop $PROGRESS2
  ${NSD_CreateProgressBar} 0 80u 100% 8u ""
  Pop $PROGRESS3
StrCpy $TICK 0
${NSD_CreateTimer} OnTick 50

  ${NSD_CreateLabel} 0 94u 100% 10u "© 2026 ToskeraLAB"
  Pop $0
  ${NSD_CreateCheckBox} 0 106u 100% 10u "Instalar VC++ Redistributable"
  Pop $SUPP_CHECK
  ${NSD_Check} $SUPP_CHECK

  nsDialogs::Show
FunctionEnd

Function InstallScreenLeave
  ${NSD_GetState} $SUPP_CHECK $SUPP_STATE
  ${NSD_KillTimer} OnTick
FunctionEnd

Function OnTick
IntOp $TICK $TICK + 2
  ${If} $TICK > 300
    StrCpy $TICK 0
  ${EndIf}
  ${If} $TICK < 0
    StrCpy $TICK 0
  ${EndIf}
  ${If} $TICK > 100
    StrCpy $TICK 100
  ${EndIf}
  SendMessage $PROGRESS ${PBM_SETPOS} $TICK 0
IntOp $0 $TICK - 100
  ${If} $0 < 0
    StrCpy $0 0
  ${EndIf}
  ${If} $0 > 100
    StrCpy $0 100
  ${EndIf}
  SendMessage $PROGRESS2 ${PBM_SETPOS} $0 0
IntOp $0 $TICK - 200
  ${If} $0 < 0
    StrCpy $0 0
  ${EndIf}
  ${If} $0 > 100
    StrCpy $0 100
  ${EndIf}
  SendMessage $PROGRESS3 ${PBM_SETPOS} $0 0
FunctionEnd
Section "Install"
  SetOutPath "$INSTDIR"
  ; um File por arquivo, em ordem alfabética → ordem de empacotamento determinística
  File "/oname=assets/app.css" "../stage/assets/app.css"
  File "/oname=assets/app.js" "../stage/assets/app.js"
  File "/oname=index.html" "../stage/index.html"
  File "/oname=toskintaller.json" "../stage/toskintaller.json"
  File "/oname=toskintaller.standalone.json" "../stage/toskintaller.standalone.json"
  ${If} $SUPP_STATE == ${BST_CHECKED}
    ${If} ${FileExists} "$INSTDIR\redist/vcredist_x64.exe"
      ExecWait '"$INSTDIR\redist/vcredist_x64.exe" /quiet /norestart'
    ${EndIf}
  ${EndIf}
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd
Section "Uninstall"
  RMDir /r "$INSTDIR"
SectionEnd
