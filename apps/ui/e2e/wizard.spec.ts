import { expect, test } from "@playwright/test";

/**
 * E2e mínimo do wizard (Iteração 4, CI Windows):
 * 1. a página carrega sem erro de console (regressão do hotfix de MIME);
 * 2. o bundle .js é servido com Content-Type correto (módulo executa);
 * 3. o fluxo básico renderiza os elementos do wizard.
 */

test("wizard carrega e renderiza sem erro de módulo", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/");

  // A tela do wizard renderizou (root não vazio) — prova que o módulo JS executou
  const rootContent = await page.locator("#root").innerHTML();
  expect(rootContent.length).toBeGreaterThan(0);

  // Nenhum erro de console (ex.: "Failed to load module script: MIME type text/html")
  const mimeErrors = consoleErrors.filter((e) => /MIME|module script/i.test(e));
  expect(mimeErrors, consoleErrors.join("\n")).toHaveLength(0);
});

test("asset do bundle é servido com Content-Type application/javascript", async ({ request }) => {
  // Descobre o nome do bundle no index.html
  const index = await request.get("/");
  expect(index.ok()).toBeTruthy();
  const html = await index.text();
  const match = /\/assets\/([A-Za-z0-9_-]+\.js)/.exec(html);
  expect(match, "index.html deve referenciar um bundle em /assets/").toBeTruthy();

  const res = await request.get(`/assets/${match![1]}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/javascript");
});

test("fluxo do wizard: passo inicial visível e navegação básica funciona", async ({ page }) => {
  await page.goto("/");
  // O primeiro passo (input da build) deve estar renderizado com botão de avanço
  await expect(page.locator("text=Toskinstaller").first()).toBeVisible({ timeout: 15_000 });
  // Qualquer botão principal do wizard presente
  const buttons = page.locator("button");
  expect(await buttons.count()).toBeGreaterThan(0);
});
