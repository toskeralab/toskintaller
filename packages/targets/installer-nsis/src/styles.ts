import type { ProgressStyle } from "@toskintaller/config";

/**
 * Fragmento NSIS injetado na página custom para criar o controle de progresso
 * do estilo selecionado (decisão S0.4 — 2 a 5 estilos simples).
 *
 * Cada estilo define:
 * - `controls`: criação do(s) controle(s) + timer (opcional)
 * - `tick`: corpo da função OnTick (opcional — estilos sem timer não usam)
 * - `usesTimer`: se o estilo usa timer (para emitir KillTimer no leave)
 */
export interface StyleFragments {
  controls: string;
  tick?: string;
  usesTimer: boolean;
}

export function styleFragments(style: ProgressStyle): StyleFragments {
  switch (style) {
    case "smooth":
      return {
        usesTimer: true,
        controls: [
          "; [smooth] barra de progresso suave (determinada)",
          progressBar("$PROGRESS", 66, "smooth"),
          "StrCpy $TICK 0",
          createTimer("OnTick", 60),
        ].join("\n"),
        tick: [
          "IntOp $TICK $TICK + 2",
          ifGt("$TICK", "100", "StrCpy $TICK 0"),
          setPos("$PROGRESS", "$TICK"),
        ].join("\n"),
      };

    case "marquee":
      return {
        usesTimer: false,
        controls: [
          "; [marquee] barra indeterminada (rolagem contínua)",
          progressBar("$PROGRESS", 66, "marquee"),
          "SendMessage $PROGRESS ${PBM_SETMARQUEE} 1 0",
        ].join("\n"),
      };

    case "pulse":
      return {
        usesTimer: true,
        controls: [
          "; [pulse] barra que pulsa 0→100→0",
          progressBar("$PROGRESS", 66),
          "StrCpy $TICK 0",
          "StrCpy $DIR 1",
          createTimer("OnTick", 40),
        ].join("\n"),
        tick: [
          ifEq("$DIR", "1", ["IntOp $TICK $TICK + 4", ifGe("$TICK", "100", "StrCpy $TICK 100\nStrCpy $DIR 0")]),
          ifEq("$DIR", "0", ["IntOp $TICK $TICK - 4", ifLe("$TICK", "0", "StrCpy $TICK 0\nStrCpy $DIR 1")]),
          setPos("$PROGRESS", "$TICK"),
        ].join("\n"),
      };

    case "bars":
      return {
        usesTimer: true,
        controls: [
          "; [bars] 3 segmentos preenchendo em sequência",
          progressBar("$PROGRESS", 60),
          progressBar("$PROGRESS2", 70),
          progressBar("$PROGRESS3", 80),
          "StrCpy $TICK 0",
          createTimer("OnTick", 50),
        ].join("\n"),
        tick: [
          "IntOp $TICK $TICK + 2",
          ifGt("$TICK", "300", "StrCpy $TICK 0"),
          clampBar("$PROGRESS", "$TICK", "0", "100"),
          "IntOp $0 $TICK - 100",
          clampBar("$PROGRESS2", "$0", "0", "100"),
          "IntOp $0 $TICK - 200",
          clampBar("$PROGRESS3", "$0", "0", "100"),
        ].join("\n"),
      };

    case "dots":
      return {
        usesTimer: true,
        controls: [
          "; [dots] indicador de pontos animado",
          nsdLabel("$DOTS_LBL", 66, "Instalando"),
          "StrCpy $TICK 0",
          createTimer("OnTick", 200),
        ].join("\n"),
        tick: [
          "IntOp $TICK $TICK + 1",
          "IntOp $TICK $TICK % 4",
          ifEq("$TICK", "0", setText("$DOTS_LBL", "Instalando")),
          ifEq("$TICK", "1", setText("$DOTS_LBL", "Instalando.")),
          ifEq("$TICK", "2", setText("$DOTS_LBL", "Instalando..")),
          ifEq("$TICK", "3", setText("$DOTS_LBL", "Instalando...")),
        ].join("\n"),
      };
  }
}

// ── helpers de geração ────────────────────────────────────────────────

function createTimer(fn: string, ms: number): string {
  return `\${NSD_CreateTimer} ${fn} ${ms}`;
}

/** Cria progress bar via nsDialogs (com estilo opcional PBS_SMOOTH/PBS_MARQUEE). */
function progressBar(varName: string, y: number, kind?: "smooth" | "marquee"): string {
  const style =
    kind === "smooth"
      ? `\n  \${NSD_AddStyle} ${varName} \${PBS_SMOOTH}`
      : kind === "marquee"
        ? `\n  \${NSD_AddStyle} ${varName} \${PBS_MARQUEE}`
        : "";
  return `  \${NSD_CreateProgressBar} 0 ${y}u 100% 8u ""\n  Pop ${varName}${style}`;
}

function nsdLabel(varName: string, y: number, text: string): string {
  return `  \${NSD_CreateLabel} 0 ${y}u 100% 10u "${text}"\n  Pop ${varName}`;
}

function setText(varName: string, text: string): string {
  return `  \${NSD_SetText} ${varName} "${text}"`;
}

function setPos(varName: string, posVar: string): string {
  return `  SendMessage ${varName} \${PBM_SETPOS} ${posVar} 0`;
}

type Body = string | string[];

function bodyLines(body: Body): string {
  return Array.isArray(body) ? body.join("\n") : body;
}

function ifGt(a: string, b: string, body: Body): string {
  return `  \${If} ${a} > ${b}\n${indent(bodyLines(body))}\n  \${EndIf}`;
}

function ifGe(a: string, b: string, body: Body): string {
  return `  \${If} ${a} >= ${b}\n${indent(bodyLines(body))}\n  \${EndIf}`;
}

function ifLe(a: string, b: string, body: Body): string {
  return `  \${If} ${a} <= ${b}\n${indent(bodyLines(body))}\n  \${EndIf}`;
}

function ifEq(a: string, b: string, body: Body): string {
  return `  \${If} ${a} == ${b}\n${indent(bodyLines(body))}\n  \${EndIf}`;
}

/** Clamp position into [min,max] and set on the bar. */
function clampBar(varName: string, posVar: string, min: string, max: string): string {
  return [
    `  \${If} ${posVar} < ${min}`,
    `    StrCpy ${posVar} ${min}`,
    `  \${EndIf}`,
    `  \${If} ${posVar} > ${max}`,
    `    StrCpy ${posVar} ${max}`,
    `  \${EndIf}`,
    setPos(varName, posVar),
  ].join("\n");
}

function indent(s: string): string {
  return s
    .split("\n")
    .map((l) => (l.trim() ? `    ${l.trim()}` : l))
    .join("\n");
}