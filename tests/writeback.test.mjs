import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const edge = fs.readFileSync("supabase/functions/tce-progress/index.ts", "utf8");
const config = fs.readFileSync("supabase/config.toml", "utf8");
const client = fs.readFileSync("src/progress.ts", "utf8");
const panel = fs.readFileSync("src/ProgressPanel.tsx", "utf8");
const executionForms = fs.readFileSync("src/ExecutionForms.tsx", "utf8");
const publicEdge = fs.readFileSync("supabase/functions/tce-public-snapshot/index.ts", "utf8");

test("writeback versionado preserva Dxx como identidade e resolve Sxx no Notion", () => {
  assert.match(edge, /normDxx/);
  assert.match(edge, /resolveDay\(ev\.v\.dxx/);
  assert.match(edge, /DXX_SXX_CONFLICT/);
  assert.match(edge, /Conflito Dxx\/Sxx/);
});

test("endpoint protege duplicidade, replay e revisão canônica", () => {
  for (const code of [
    "IDEMPOTENCY_KEY_REUSED",
    "STALE_REPLAY",
    "CANONICAL_REVISION_CHANGED",
    "CANONICAL_REVISION_UNKNOWN",
    "SUPERSEDED_BY_NEWER_EVENT",
    "NOTION_DUPLICATE_IDEMPOTENCY",
  ]) {
    assert.ok(edge.includes(code), `proteção ausente: ${code}`);
  }
  assert.match(edge, /owner_id.*idempotency_key/);
  assert.match(edge, /findNotionSessions/);
});

test("função exige autenticação e não transforma Supabase em fonte canônica", () => {
  assert.match(config, /\[functions\.tce-progress\][\s\S]*verify_jwt\s*=\s*true/);
  assert.match(edge, /currentUser\(req\)/);
  assert.match(edge, /allowedUser\(user\.id\)/);
  assert.match(edge, /TCE_GO_NOTION_TOKEN/);
  assert.match(edge, /canonical:true/);
});

test("leitura inicial de progresso não cria estado vazio no Supabase", () => {
  assert.match(edge, /const cached=await one\("tce_progress_state"/);
  assert.match(edge, /const hasRealProgress=/);
  assert.match(edge, /if\(cached\|\|hasRealProgress\)await stateWrite\(s\)/);
});

test("frontend preserva fila offline e só confirma cache após resposta do Notion", () => {
  assert.match(client, /tce-go\.pending-events\.v1/);
  assert.match(client, /tce-go\.confirmed-progress\.v1/);
  assert.match(client, /replaceQueued\(event\)/);
  assert.match(client, /removeQueued\(event\.idempotencyKey\)/);
  assert.match(client, /data\?\.status === "confirmed"/);
  assert.match(panel, /Pendente de sincronização/);
  assert.match(panel, /Confirmado no Notion/);
});

test("evento carrega a identidade operacional obrigatória", () => {
  for (const field of ["dxx", "sxx", "eventType", "timestamp", "origin", "idempotencyKey"]) {
    assert.ok(client.includes(field), `campo ausente no cliente: ${field}`);
    assert.ok(edge.includes(field), `campo ausente no endpoint: ${field}`);
  }
});

test("deep-link reutiliza Plataforma sem substituir Qxx", () => {
  assert.match(client, /view", "questions"/);
  assert.match(client, /searchParams\.set\("dxx"/);
  assert.match(client, /searchParams\.set\("sxx"/);
  assert.match(client, /searchParams\.set\("disciplina"/);
  assert.match(client, /searchParams\.set\("assunto"/);
  assert.match(client, /searchParams\.set\("size"/);
  assert.match(client, /searchParams\.set\("autostart", "1"\)/);
});


test("writeback especializado atualiza os bancos canônicos dedicados", () => {
  for (const marker of [
    "const REVIEWS=",
    "REDACTIONS=",
    "ERRORS_BANK=",
    "SIMULATIONS=",
    "writeReview",
    "writeEssay",
    "writeSimulation",
    "writeError",
    "queryDataSource",
  ]) assert.ok(edge.includes(marker), `writeback especializado ausente: ${marker}`);
  assert.match(edge, /if\(!stateEvent\)/);
  assert.match(edge, /SPECIALIZED_PAYLOAD_INVALID/);
  assert.match(edge, /error\.capture/);
});

test("site expõe formulários privados sem inserir execução por padrão", () => {
  for (const marker of ["ReviewWriteback", "EssayWriteback", "SimulationWriteback", "ErrorWriteback"]) {
    assert.ok(executionForms.includes(marker), `formulário ausente: ${marker}`);
  }
  for (const eventType of ["review.snapshot", "essay.result", "simulation.result", "error.capture"]) {
    assert.ok(executionForms.includes(eventType), `evento não ligado à UI: ${eventType}`);
  }
  assert.match(executionForms, /hasConnectedAccount/);
  assert.match(executionForms, /queueAndSync/);
});

test("fallback Edge publica o mesmo núcleo auxiliar do sync direto", () => {
  assert.match(publicEdge, /auxiliaryMode:\s*"full"/);
  for (const marker of ["REDACTIONS", "SIMULATIONS", "EDITAL", "SOURCES", "FINAL_SPRINT"]) {
    assert.ok(publicEdge.includes(marker), `fonte auxiliar ausente no fallback: ${marker}`);
  }
  for (const marker of ["redactions", "simulations", "edital", "legislation", "finalSprint"]) {
    assert.ok(publicEdge.includes(marker), `payload auxiliar ausente no fallback: ${marker}`);
  }
});


test("painel mínimo canônico de checkpoint é exigido no frontend e no endpoint", () => {
  for (const marker of [
    "coverageExecuted",
    "sessionsCompleted",
    "knownPercent",
    "timeByBlock",
    "weakKnown",
    "p1Open",
    "openErrors",
    "recurrent",
    "impactedSeedf",
    "impactedTjdft",
  ]) {
    assert.ok(executionForms.includes(marker), `campo do painel mínimo ausente na UI: ${marker}`);
    assert.ok(edge.includes(marker), `campo do painel mínimo ausente no endpoint: ${marker}`);
  }
  assert.match(edge, /\(gc\+2\*sc\)\/115\*100/);
  assert.match(edge, /Simulado\/checkpoint exige ao menos uma questão executada/);
  assert.match(edge, /Simulado\/checkpoint exige tempo por bloco/);
  assert.match(edge, /Simulado\/checkpoint exige pontos fracos das matérias conhecidas/);
});

test("redação produzida ou corrigida exige linhas e tempo e mantém rubrica FCC 100", () => {
  assert.match(edge, /\["Produzida","Corrigida","Reescrita"\]\.includes\(status\)/);
  for (const marker of [
    "Recorte temático /20",
    "Interpretação crítica /20",
    "Progressão /30",
    "Vocabulário /8",
    "Coesão /16",
    "Morfossintaxe /6",
  ]) assert.ok(edge.includes(marker), `critério FCC ausente: ${marker}`);
});
