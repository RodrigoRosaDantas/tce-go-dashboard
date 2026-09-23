import { chromium } from "playwright";

const baseUrl = process.env.V4_E2E_BASE_URL || process.env.V3_VISUAL_BASE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));

await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".app-v3");

// 1) Busca local por conteúdo do material.
await page.keyboard.press("Control+K");
await page.waitForSelector(".command-palette");
await page.locator(".command-palette input").fill("art. 71");
await page.waitForTimeout(100);
const searchGroups = await page.locator(".command-results .result-group").allTextContents();
check(searchGroups.some((value) => ["Conteúdo","Questões"].includes(value.trim())), "Ctrl+K não retornou conteúdo/Qxx para art. 71");
await page.keyboard.press("Escape");

// 2) Notas locais persistem.
await page.goto(baseUrl + "/dia/d001/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".study-player");
await page.locator(".study-notebook-v4 > .tool-button").click();
await page.locator(".notebook-panel-v4 textarea").fill("Nota E2E privada D001");
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator(".study-notebook-v4 > .tool-button").click();
check(await page.locator(".notebook-panel-v4 textarea").inputValue() === "Nota E2E privada D001", "Nota local não persistiu após reload");

// 3) Timer persiste após reload.
await page.locator(".study-timer button", { hasText: "Iniciar" }).click();
await page.waitForTimeout(1200);
await page.locator(".study-timer button", { hasText: "Pausar" }).click();
const beforeReload = await page.locator(".study-timer strong").innerText();
await page.reload({ waitUntil: "domcontentloaded" });
const afterReload = await page.locator(".study-timer strong").innerText();
check(afterReload === beforeReload && afterReload !== "00:00:00", `Timer não persistiu: antes=${beforeReload}, depois=${afterReload}`);

// 4) Primeira seção: marcar lida + bookmark e persistir.
const firstIndex = page.locator(".lesson-index-v4 .index-item-v4").first();
if (await firstIndex.count()) {
  const buttons = firstIndex.locator("button");
  await buttons.nth(0).click();
  await buttons.nth(1).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  const reloaded = page.locator(".lesson-index-v4 .index-item-v4").first();
  check((await reloaded.getAttribute("class") || "").includes("completed"), "Seção lida não persistiu");
  check((await reloaded.locator("button").nth(1).innerText()).includes("★"), "Bookmark não persistiu");
} else {
  failures.push("Índice V4 não possui seções no D001");
}

// 5) Resultado Qxx local é importado no fechamento sem salvar.
await page.evaluate(() => {
  localStorage.setItem("tce-go.v4.question-result.D001", JSON.stringify({
    dxx:"D001",qxx:"Q001",questionsDone:20,correct:15,errors:5,doubts:3,savedAt:new Date(Date.now()+60_000).toISOString()
  }));
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator("#registro").scrollIntoViewIfNeeded();
const numberInputs = page.locator("#registro .progress-fields input[type=number]");
check(await numberInputs.nth(1).inputValue() === "20", "Fechamento não importou questões Qxx");
check(await numberInputs.nth(2).inputValue() === "15", "Fechamento não importou acertos Qxx");
check(await numberInputs.nth(3).inputValue() === "5", "Fechamento não importou erros Qxx");
check(await numberInputs.nth(4).inputValue() === "3", "Fechamento não importou dúvidas Qxx");

// 6) Modo revisão abre sem alterar material canônico.
const revisionTrigger = page.locator(".revision-lens-trigger-v4");
check(await revisionTrigger.count() === 1, "Modo revisão não disponível no D001");
if (await revisionTrigger.count()) {
  await revisionTrigger.click();
  check(await page.locator(".revision-lens-body-v4 .revision-point-v4").count() > 0, "Modo revisão abriu sem pontos");
}

// Nenhum evento canônico deve ter sido enfileirado pelo E2E.
const queued = await page.evaluate(() => localStorage.getItem("tce-go.pending-events.v1"));
check(!queued || queued === "[]", "E2E criou evento de writeback sem submissão explícita");

await browser.close();
if (failures.length) {
  console.error("Study OS E2E falhou:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Study OS E2E aprovado: busca + notas + timer + seção/bookmark + Qxx→fechamento + revisão.");
