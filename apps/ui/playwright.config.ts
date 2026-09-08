import { defineConfig, devices } from "@playwright/test";

/**
 * E2e do wizard (Iteração 4): o servidor local da CLI serve o wizard + API
 * na mesma origem. O webServer abaixo inicia o servidor com PORT isolado
 * (usa apps/ui/dist já compilado) e o Playwright valida o fluxo visual.
 */
const PORT = process.env.PORT ?? "3210";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  webServer: {
    command: `pnpm exec tsx ../cli/src/server/index.ts`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      PORT,
    } as Record<string, string>,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
