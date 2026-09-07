// Toskinstaller — preload do shell (M4). Ponte mínima e segura entre o app
// empacotado e o shell: apenas leitura de metadados (sem Node no renderer — RNF Segurança).
"use strict";

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("__TOSKINSTALLER_SHELL__", {
  version: "0.1.0",
});
