export type WizardStep =
  | "input"
  | "mode"
  | "installScreen"
  | "supplemental"
  | "build";

export const STEPS: { key: WizardStep; label: string }[] = [
  { key: "input", label: "Build" },
  { key: "mode", label: "Modo" },
  { key: "installScreen", label: "Tela" },
  { key: "supplemental", label: "Complementos" },
  { key: "build", label: "Build" },
];
