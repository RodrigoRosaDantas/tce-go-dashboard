import fs from "node:fs";
import path from "node:path";
import { validateSnapshot } from "./snapshot-contract.mjs";

const token = process.env.TCE_GO_NOTION_TOKEN;
const dataSourceId = process.env.TCE_GO_DAYS_DATA_SOURCE_ID;
const notionVersion = process.env.NOTION_VERSION || "2026-03-11";

if (!token) throw new Error("TCE_GO_NOTION_TOKEN não configurado.");
if (!dataSourceId) throw new Error("TCE_GO_DAYS_DATA_SOURCE_ID não configurado.");

const currentPath = path.resolve("public/data/tce-go-snapshot.json");
const current = fs.existsSync(currentPath)
  ? JSON.parse(fs.readFileSync(currentPath, "utf8"))
  : { materials: {}, questions: {} };

const rows = await queryAll();
const days = rows.map(normalizeDay).sort((a, b) => a.order - b.order);
const readySlugs = new Set(days.filter((d) => d.readyForStudy).map((d) => d.slug).filter(Boolean));
const readyQuestions = new Set(days.filter((d) => d.readyForStudy).map((d) => d.questionSlug).filter(Boolean));

const snapshot = {
  schemaVersion: "1.0.0",
  generatedAt: new Date().toISOString(),
  source: "notion",
  days,
  materials: Object.fromEntries(Object.entries(current.materials || {}).filter(([slug]) => readySlugs.has(slug))),
  questions: Object.fromEntries(Object.entries(current.questions || {}).filter(([slug]) => readyQuestions.has(slug))),
  publicStats: {
    totalDays: days.length,
    activeDays: days.filter((d) => !d.protected).length,
    protectedDays: days.filter((d) => d.protected).length,
    sessions: days.filter((d) => d.session).length,
    readyDays: days.filter((d) => d.readyForStudy).length,
  },
};

const errors = validateSnapshot(snapshot);
if (errors.length) throw new Error(`Snapshot recusado:\n- ${errors.join("\n- ")}`);

const tmp = `${currentPath}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2) + "\n");
fs.renameSync(tmp, currentPath);
writeSplit(snapshot);
console.log(`Sync concluído: ${snapshot.publicStats.readyDays} dias liberados.`);

async function queryAll() {
  const rows = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const response = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": notionVersion,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Notion API ${response.status}: ${await response.text()}`);
    const json = await response.json();
    rows.push(...json.results);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return rows;
}

function normalizeDay(page) {
  const p = page.properties || {};
  const order = number(p["Ordem"]);
  const dxx = title(p["Dia"]).match(/^D\d{3}/)?.[0] || `D${String(order).padStart(3, "0")}`;
  const protectedDay = select(p["Tipo"]) === "Protegido";
  const ready = checkbox(p["Pronto para estudo"]);
  const audited = checkbox(p["Auditado"]);
  const slugValue = richText(p["Slug"]) || undefined;
  const day = {
    dxx,
    order,
    ...(protectedDay ? {} : { session: richText(p["Sessão TCE"]) }),
    protected: protectedDay,
    date: p["Data"]?.date?.start?.slice(0, 10) || "",
    type: select(p["Tipo"]) || "",
    focus: richText(p["Foco"]) || "",
    editorialStatus: protectedDay ? "protected" : ready ? "ready" : audited ? "audited" : "draft",
    readyForStudy: ready,
    ...(slugValue ? { slug: slugValue, questionSlug: `q${dxx.slice(1)}` } : {}),
  };
  const version = number(p["Versão editorial"]);
  if (version) day.version = version;
  return day;
}

function title(prop) { return prop?.title?.map((x) => x.plain_text).join("") || ""; }
function richText(prop) { return prop?.rich_text?.map((x) => x.plain_text).join("") || ""; }
function select(prop) { return prop?.select?.name || ""; }
function number(prop) { return Number(prop?.number || 0); }
function checkbox(prop) { return Boolean(prop?.checkbox); }

function writeSplit(data) {
  const dir = path.resolve("public/data");
  fs.writeFileSync(path.join(dir, "tce-go-days.json"), JSON.stringify(data.days, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "tce-go-materials.json"), JSON.stringify(data.materials, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "tce-go-questions.json"), JSON.stringify(data.questions, null, 2) + "\n");
}
