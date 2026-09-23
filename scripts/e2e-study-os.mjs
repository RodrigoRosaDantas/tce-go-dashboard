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

// 5) Q001 separa 18 FCC + 2 autorais.
await page.goto(baseUrl + "/questoes/q001/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".question-hub");
const fccRespondidas = page.locator(".fcc-summary-fields-v4 input").first();
check(await fccRespondidas.getAttribute("max") === "18", "Q001 não limitou a parte FCC a 18 itens");

// 6) Resultado Qxx local substitui métricas anteriores como conjunto atômico.
await page.goto(baseUrl + "/dia/d001/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("tce-go.confirmed-progress.v1", JSON.stringify({
    D001:{
      dxx:"D001",sxx:"S01",studied:true,completed:false,timeMinutes:60,
      questionsDone:20,correct:18,errors:2,doubts:1,
      canonical:false,source:"cache",
      confirmedAt:new Date(Date.now()-120000).toISOString(),
      eventOccurredAt:new Date(Date.now()-120000).toISOString()
    }
  }));
});
await page.evaluate(() => {
  localStorage.setItem("tce-go.v4.question-result.D001", JSON.stringify({
    dxx:"D001",qxx:"Q001",questionsDone:20,correct:10,errors:10,doubts:2,savedAt:new Date(Date.now()+60_000).toISOString()
  }));
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator("#registro").scrollIntoViewIfNeeded();
const numberInputs = page.locator("#registro .progress-fields input[type=number]");
check(await numberInputs.nth(1).inputValue() === "20", "Fechamento não importou questões Qxx");
check(await numberInputs.nth(2).inputValue() === "10", "Fechamento misturou acertos antigos com o Qxx mais recente");
check(await numberInputs.nth(3).inputValue() === "10", "Fechamento misturou erros antigos com o Qxx mais recente");
check(await numberInputs.nth(4).inputValue() === "2", "Fechamento misturou dúvidas antigas com o Qxx mais recente");

// 7) Modo revisão abre sem alterar material canônico.
const revisionTrigger = page.locator(".revision-lens-trigger-v4");
check(await revisionTrigger.count() === 1, "Modo revisão não disponível no D001");
if (await revisionTrigger.count()) {
  await revisionTrigger.click();
  check(await page.locator(".revision-lens-body-v4 .revision-point-v4").count() > 0, "Modo revisão abriu sem pontos");
}

// 8) "Programar D7" abre o formulário como revisão futura, não concluída.
const d7Link = page.locator(".closing-links-v4 a", { hasText: "Programar D7" });
check((await d7Link.getAttribute("href") || "").includes("status=Pr%C3%B3xima"), "Deep-link D7 não abre como Próxima");
await d7Link.click();
await page.waitForSelector("#review-form");
const statusSelect = page.locator("#review-form label", { hasText: "Status" }).locator("select");
check(await statusSelect.inputValue() === "Próxima", "Formulário D7 não respeitou status Próxima");

// 9) Dashboard V4.1 preserva null e usa Dxx como fonte analítica.
await page.evaluate(() => {
  localStorage.setItem("tce-go.operational-summary.v2", JSON.stringify({
    generatedAt:new Date().toISOString(),
    canonical:false,
    source:"cache",
    degraded:true,
    progress:[],
    dayControl:[
      {id:"d1",dxx:"D001",sxx:"S01",order:1,type:"Estudo",protected:false,status:"Não iniciado",focus:"Controle Externo",studied:false,completed:false,plannedTime:"90–105 min",metaQuestions:20,timeMinutes:null,questionsDone:0,correct:0,errors:0,doubts:0,d7Triggered:false,d20Triggered:false,lastEditedAt:new Date().toISOString()},
      {id:"d3",dxx:"D003",sxx:"S02",order:3,type:"Estudo",protected:false,status:"Não iniciado",focus:"CASP",studied:false,completed:false,plannedTime:"90 min",metaQuestions:15,timeMinutes:null,questionsDone:null,correct:null,errors:null,doubts:null,d7Triggered:false,d20Triggered:false,lastEditedAt:new Date().toISOString()},
      {id:"d5",dxx:"D005",sxx:"S03",order:5,type:"Estudo",protected:false,status:"Em andamento",focus:"Auditoria",studied:true,completed:false,plannedTime:"90 min",metaQuestions:15,timeMinutes:null,questionsDone:10,correct:7,errors:3,doubts:null,d7Triggered:false,d20Triggered:false,lastEditedAt:new Date().toISOString()}
    ],
    sessions:[
      {id:"s1",title:"D005 · S03",dxx:"D005",sxx:"S03",type:"Questões",eventType:"manual",origin:"manual-notion",date:new Date().toISOString(),timestamp:new Date().toISOString(),timeMinutes:null,questions:10,correct:7,errors:3,doubts:null}
    ],
    questionMeta:[
      {id:"q1",dxx:"D001",qxx:"Q001",focus:"Controle Externo I — sistema constitucional de controle",meta:20,valid:20},
      {id:"q3",dxx:"D003",qxx:"Q003",focus:"CASP I — entrada",meta:15,valid:15},
      {id:"q5",dxx:"D005",qxx:"Q005",focus:"Legislação Institucional I — Constituição do Estado",meta:15,valid:15}
    ],
    reviews:[],errors:[],redactions:[],simulations:[]
  }));
});
await page.goto(baseUrl + "/desempenho/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".data-dashboard-v41");
check((await page.locator(".analytics-tabs-v41 button").allTextContents()).includes("Dados"), "Dashboard V4.1 não exibiu aba Dados");
await page.locator(".analytics-tabs-v41 button", { hasText: "Execução" }).click();
await page.waitForSelector(".analytics-table-v41");
const d003Row = page.locator(".analytics-table-v41 tbody tr", { hasText: "D003" });
check((await d003Row.innerText()).includes("—"), "D003 com métricas null não preservou vazio visual");
const d005Row = page.locator(".analytics-table-v41 tbody tr", { hasText: "D005" });
check((await d005Row.innerText()).includes("70.0%"), "D005 não calculou precisão a partir do Notion/cache canônico");
check((await d005Row.innerText()).includes("Sessão no Notion"), "Origem manual do Notion não foi identificada");
await page.locator(".analytics-tabs-v41 button", { hasText: "Dados" }).click();
check((await page.locator(".data-issues-v41").innerText()).includes("D005"), "Qualidade de dados não sinalizou D005 incompleto");
check((await page.locator(".data-issues-v41").innerText()).includes("Tempo real"), "Qualidade de dados não identificou Tempo real ausente");
check((await page.locator(".data-issues-v41").innerText()).includes("Acertos com dúvida"), "Qualidade de dados não identificou Acertos com dúvida ausente");
await page.locator(".analytics-tabs-v41 button", { hasText: "Matérias" }).click();
check((await page.locator(".subject-cards-v41").innerText()).includes("Controle Externo"), "Matéria/foco do Notion não alimentou agrupamento de Controle Externo");
check((await page.locator(".subject-cards-v41").innerText()).includes("CASP"), "Matéria/foco do Notion não alimentou agrupamento CASP");
await page.locator(".analytics-tabs-v41 button", { hasText: "Edital" }).click();
check((await page.locator(".model-gap-v41").innerText()).includes("não fabrica percentual"), "Dashboard não declarou a ausência de relação Dxx/Qxx no edital");

// Nenhum evento canônico deve ter sido enfileirado pelo E2E.
const queued = await page.evaluate(() => localStorage.getItem("tce-go.pending-events.v1"));
check(!queued || queued === "[]", "E2E criou evento de writeback sem submissão explícita");

await browser.close();
if (failures.length) {
  console.error("Study OS E2E falhou:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Study OS E2E aprovado: fluxo de estudo + Dashboard Notion-first + null preservado + qualidade de dados.");
