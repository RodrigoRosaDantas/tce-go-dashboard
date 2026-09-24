import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.tsx", "utf8");
const app = fs.readFileSync("src/AppV3.tsx", "utf8");
const shell = fs.readFileSync("src/v3/Shell.tsx", "utf8");
const home = fs.readFileSync("src/v3/HomePage.tsx", "utf8");
const study = fs.readFileSync("src/v3/StudyPage.tsx", "utf8");
const tools = fs.readFileSync("src/v3/StudyTools.tsx", "utf8");
const css = fs.readFileSync("src/v3.css", "utf8");
const sync = fs.readFileSync("scripts/sync-tce-go.mjs", "utf8");
const publicContent = fs.readFileSync("scripts/notion-public-content.mjs", "utf8");

test("V3 é a aplicação ativa e a V2 continua preservada", () => {
  assert.match(main, /import App from "\.\/AppV3"/);
  assert.match(main, /import "\.\/v3\.css"/);
  assert.ok(fs.existsSync("src/App.tsx"));
  assert.ok(fs.existsSync("src/styles.css"));
});

test("Home mantém sequência pedagógica dentro do orquestrador operacional", () => {
  assert.match(home, /buildStudyIntelligence\(\{ snapshot, summary \}\)/);
  assert.match(home, /nextSession = published\.find/);
  assert.doesNotMatch(home, /date >= today/);
});

test("Golden Flow expõe material, Qxx, fechamento e ferramentas de sessão", () => {
  assert.match(study, /ReadingProgress/);
  assert.match(study, /StudyTimer/);
  assert.match(study, /SessionChecklist/);
  assert.match(study, /id="aula"/);
  assert.match(study, /id="questoes"/);
  assert.match(study, /id="registro"/);
  assert.match(study, /ProgressPanel day=\{day\}/);
});

test("Leitor V3 oferece tema, escala, largura, foco e retomada", () => {
  assert.match(tools, /theme: Theme/);
  assert.match(tools, /textScale: TextScale/);
  assert.match(tools, /width: ReaderWidth/);
  assert.match(tools, /focus: boolean/);
  assert.match(tools, /Retomar/);
  assert.match(tools, /tce-study-time/);
});

test("Command palette cobre navegação e somente sessões Sxx publicadas", () => {
  assert.match(shell, /Ctrl K/);
  assert.match(shell, /publishedDays\(snapshot\)/);
  assert.match(shell, /command-palette/);
});

test("Qxx seguro continua metadata-only mas pode carregar HTML derivado do Notion", () => {
  assert.match(publicContent, /copyrightMode: "metadata-only"/);
  assert.match(publicContent, /contentHtml, sections, hash: sha256\(contentHtml\)/);
  assert.match(sync, /publishQuestionContent = item\.day\.dxx === "D001"/);
  assert.match(sync, /getBlockTree\(item\.questionPageId\)/);
  assert.match(sync, /blocks: publishQuestionContent \? questionBlocks : \[\]/);
});

test("CSS V3 é independente da pilha V2 e cobre foco + mobile", () => {
  assert.match(css, /html\[data-tce-focus="true"\]/);
  assert.match(css, /@media\(max-width:820px\)/);
  assert.match(css, /bottom-nav-v3/);
  assert.match(css, /study-workspace/);
  assert.doesNotMatch(css, /TCE-GO V2/);
});

test("Router V3 mantém rotas públicas críticas", () => {
  for (const route of ["/hoje/", "/dias/", "/revisoes/", "/mentor/", "/erros/", "/desempenho/", "/riscos/", "/redacoes/", "/simulados/", "/edital/", "/legislacao/", "/reta-final/", "/sync/"]) {
    assert.ok(app.includes(`route === "${route}"`), `rota ausente: ${route}`);
  }
  assert.match(app, /\/dia\\\/\(d\\d\{3\}\)/);
  assert.match(app, /\/questoes\\\/\(q\\d\{3\}\)/);
});


test("Shell V3 agrupa Dxx/Qxx em Trilha e busca apenas sessões publicadas", () => {
  assert.match(shell, /route\.startsWith\("\/dia\/"\)/);
  assert.match(shell, /route\.startsWith\("\/questoes\/"\)/);
  assert.match(shell, /publishedDays\(snapshot\)/);
  assert.doesNotMatch(shell, /const sessions = activeDays\(snapshot\)/);
});

test("PWA V4 invalida caches legados V1/V3", () => {
  const sw = fs.readFileSync("public/sw.js", "utf8");
  assert.match(sw, /tce-go-v4-20260923/);
  assert.doesNotMatch(sw, /const CACHE = "tce-go-v1"/);
  assert.doesNotMatch(sw, /const CACHE = "tce-go-v3-20260923"/);
});

test("Desktop e tablet escondem índice HTML duplicado, mobile preserva o índice interno", () => {
  assert.match(css, /@media\(min-width:821px\)/);
  assert.match(css, /\.question-content-card \.study-content > \.study-index\{display:none\}/);
});

test("QA visual usa o mesmo base path do GitHub Pages", () => {
  const workflow = fs.readFileSync(".github/workflows/v3-visual.yml", "utf8");
  assert.match(workflow, /GITHUB_PAGES_BASE_PATH: "\/tce-go-dashboard"/);
  assert.match(workflow, /V3_VISUAL_BASE_URL: "http:\/\/127\.0\.0\.1:4173\/tce-go-dashboard"/);
});
