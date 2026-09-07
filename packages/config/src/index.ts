import { z } from "zod";

/**
 * Estilos simples de progresso aceitos no MVP (decisão S0.4):
 * 2 a 5 estilos selecionáveis no manifest (`installScreen.progress.style`).
 * Cada estilo tem um fragmento NSIS correspondente no target installer-nsis.
 */
export const PROGRESS_STYLES = ["smooth", "marquee", "pulse", "bars", "dots"] as const;
export const progressStyleSchema = z.enum(PROGRESS_STYLES);

const appSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  publisher: z.string().default("ToskeraLAB"),
  icon: z.string().optional(),
});

const inputSchema = z.object({
  type: z.enum(["folder", "zip"]).default("folder"),
  path: z.string().min(1),
  entry: z.string().default("index.html"),
});

const bannerSchema = z.object({
  type: z.enum(["image", "gradient"]).default("gradient"),
  src: z.string().optional(),
  position: z.enum(["header", "footer"]).default("header"),
});

const progressSchema = z.object({
  style: progressStyleSchema.default("smooth"),
  labels: z
    .object({
      installing: z.string().default("Instalando arquivos..."),
      done: z.string().default("Concluído!"),
    })
    .default({}),
});

const supplementalSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  file: z.string().min(1),
  silentArgs: z.string().default("/S"),
  required: z.boolean().default(false),
  defaultChecked: z.boolean().default(true),
});

const installScreenSchema = z.object({
  title: z.string().min(1).default("Instalação"),
  subtitle: z.string().default(""),
  footer: z.string().default(""),
  banner: bannerSchema.default({}),
  progress: progressSchema.default({}),
  supplemental: z.array(supplementalSchema).default([]),
  finish: z
    .object({
      title: z.string().default("Instalação concluída"),
      message: z.string().default("Obrigado por instalar!"),
      runAfterInstall: z.boolean().default(true),
    })
    .default({}),
});

const installerSchema = z.object({
  targetDir: z.enum(["%LOCALAPPDATA%", "%ProgramFiles%"]).default("%LOCALAPPDATA%"),
  perMachine: z.boolean().default(false),
  shortcuts: z.array(z.enum(["desktop", "startMenu"])).default([]),
  uninstaller: z.boolean().default(true),
  silentFlags: z
    .object({
      install: z.string().default("/S"),
      uninstall: z.string().default("/S"),
    })
    .default({}),
});

const artifactSchema = z.object({
  outDir: z.string().default("./release"),
  fileName: z.string().min(1),
  compression: z.enum(["store", "normal", "max"]).default("normal"),
});

export const manifestSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  app: appSchema,
  input: inputSchema,
  mode: z.enum(["standalone", "installer"]).default("installer"),
  installScreen: installScreenSchema.default({}),
  installer: installerSchema.default({}),
  artifact: artifactSchema,
});

export type Manifest = z.infer<typeof manifestSchema>;
export type ProgressStyle = z.infer<typeof progressStyleSchema>;
export type Supplemental = z.infer<typeof supplementalSchema>;