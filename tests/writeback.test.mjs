import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const edge = fs.readFileSync("supabase/functions/tce-progress/index.ts", "utf8");
const config = fs.readFileSync("supabase/config.toml", "utf8");
const client = fs.readFileSync("src/progress.ts", "utf8");
const panel = fs.readFileSync("src/ProgressPanel.tsx", "utf8");

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
