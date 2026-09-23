import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/AppV3.tsx","utf8");
const home = fs.readFileSync("src/v3/HomePage.tsx","utf8");
const shell = fs.readFileSync("src/v3/Shell.tsx","utf8");
const study = fs.readFileSync("src/v3/StudyPage.tsx","utf8");
const tools = fs.readFileSync("src/v3/StudyTools.tsx","utf8");
const progress = fs.readFileSync("src/ProgressPanel.tsx","utf8");
const trainer = fs.readFileSync("src/v4/QuestionTrainer.tsx","utf8");
const operations = fs.readFileSync("src/v4/operations.ts","utf8");
const context = fs.readFileSync("src/v4/OperationalContext.tsx","utf8");
const trail = fs.readFileSync("src/v4/TrailPage.tsx","utf8");
const revisions = fs.readFileSync("src/v4/RevisionsPage.tsx","utf8");
const errors = fs.readFileSync("src/v4/ErrorsPage.tsx","utf8");
const performance = fs.readFileSync("src/v4/PerformancePage.tsx","utf8");
const sprint = fs.readFileSync("src/v4/FinalSprintPage.tsx","utf8");
const sync = fs.readFileSync("scripts/sync-tce-go.mjs","utf8");
const contract = fs.readFileSync("scripts/snapshot-contract.mjs","utf8");

test("V4 mantém provider operacional acima de todas as páginas", () => {
  assert.match(app, /OperationalProvider snapshot=\{snapshot\}/);
  for (const marker of ["TrailPageV4","RevisionsPageV4","ErrorsPageV4","PerformancePageV4","FinalSprintPageV4"]) {
    assert.ok(app.includes(marker), `página V4 não ativada: ${marker}`);
  }
});

test("orquestrador usa prioridade determinística sem inventar score", () => {
  const order = [
    'kind: "critical-error"',
    'kind: "overdue-review"',
    'kind: "resume"',
    'kind: "redaction"',
    'kind: "simulation"',
    'kind: "next-session"',
    'kind: "upcoming-review"',
  ].map((marker) => operations.indexOf(marker));
  assert.ok(order.every((index) => index >= 0));
  for (let i=1;i<order.length;i++) assert.ok(order[i] > order[i-1], "ordem de decisão mudou");
  assert.doesNotMatch(operations, /Math\.random|machine learning|OpenAI|chatgpt/i);
  assert.match(home, /Por que agora\?/);
});

test("Trilha, Revisões, Erros e Desempenho consomem o mesmo estado operacional", () => {
  for (const source of [trail,revisions,errors,performance,sprint]) {
    assert.match(source, /useOperational\(\)/);
  }
  assert.match(trail, /errorsForDay/);
  assert.match(trail, /reviewsForDay/);
  assert.match(revisions, /reviewQueues/);
  assert.match(errors, /isOpenError/);
  assert.match(performance, /DIAGNÓSTICO EXPLICÁVEL/);
});

test("player local mantém ferramentas não canônicas separadas do writeback", () => {
  for (const marker of ["SessionIndex","StudyNotebook","RevisionLens","SectionNavigator"]) assert.ok(tools.includes(marker));
  assert.match(tools, /tce-go\.v4\.sections/);
  assert.match(tools, /tce-go\.v4\.notes/);
  assert.match(study, /HISTÓRICO DESTA SESSÃO/);
  assert.match(study, /Programar D7/);
  assert.match(study, /Programar D20/);
});

test("resolvedor autoral exige tentativa antes da correção e só envia resumo ao fechamento", () => {
  assert.match(trainer, /allAnswered/);
  assert.match(trainer, /disabled=\{!allAnswered \|\| reveal\}/);
  assert.match(trainer, /Corrigir itens autorais/);
  assert.match(trainer, /tce-go\.v4\.question-result/);
  assert.match(trainer, /tce-question-result/);
  assert.match(progress, /localQuestionResult/);
  assert.match(progress, /applyQuestionResult/);
  assert.match(progress, /ainda não confirmado no Notion|ainda não salvo/);
});

test("Q001 é regenerado se snapshot antigo não possuir authorialItems", () => {
  assert.match(sync, /Array\.isArray\(previousQuestion\?\.authorialItems\)/);
  assert.match(sync, /previousQuestion\.authorialItems\.length > 0/);
  assert.match(contract, /authorialItems/);
  assert.match(contract, /item autoral sem ID AUT válido/);
});

test("command palette indexa material, questões, edital e legislação com âncoras", () => {
  assert.match(shell, /group: "Conteúdo"/);
  assert.match(shell, /group: "Questões"/);
  assert.match(shell, /group: "Edital"/);
  assert.match(shell, /group: "Legislação"/);
  assert.match(shell, /#\$\{item\.id\}/);
  assert.match(shell, /art\. 71, apreciar × julgar/);
});

test("contexto cross-device atualiza após writeback, online e storage", () => {
  assert.match(context, /loadOperationalSummary/);
  assert.match(context, /tce-operational-dirty/);
  assert.match(context, /tce-progress-confirmed/);
  assert.match(context, /window\.addEventListener\("online"/);
  assert.match(context, /window\.addEventListener\("storage"/);
});


test("Qxx separa parte FCC da autoral e impede total acima da meta", () => {
  assert.match(trainer, /fccMax = Math\.max\(0, question\.valid - items\.length\)/);
  assert.match(trainer, /attempted > fccMax/);
  assert.match(trainer, /max=\{fccMax\}/);
});

test("resultado Qxx substitui métricas como conjunto atômico no fechamento", () => {
  assert.match(progress, /const questionsDone = Math\.max/);
  assert.match(progress, /if \(correct \+ errors > questionsDone \|\| doubts > correct\) return base/);
  assert.match(progress, /questionsDone,\s*correct,\s*errors,\s*doubts,/);
  assert.doesNotMatch(progress, /questionsDone: Math\.max\(base\.questionsDone/);
});
