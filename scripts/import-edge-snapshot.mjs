import fs from "node:fs";
import path from "node:path";
import { validateSnapshot } from "./snapshot-contract.mjs";

const input = process.argv[2];
if (!input) throw new Error("Informe o arquivo JSON gerado pela Edge Function.");
const incoming = JSON.parse(fs.readFileSync(input, "utf8"));
const currentPath = path.resolve("public/data/tce-go-snapshot.json");
const current = fs.existsSync(currentPath) ? JSON.parse(fs.readFileSync(currentPath, "utf8")) : null;

const errors = validateSnapshot(incoming);
if (errors.length) throw new Error("Snapshot Edge recusado:\n- " + errors.join("\n- "));

if (current?.contentHash && current.contentHash === incoming.contentHash && current.contentMode === "full") {
  console.log("Sem mudança pública no snapshot Edge.");
  process.exit(0);
}

const snapshot = {
  ...incoming,
  generatedAt: incoming.generatedAt || new Date().toISOString(),
};

const dir = path.resolve("public/data");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(currentPath, JSON.stringify(snapshot, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "tce-go-days.json"), JSON.stringify(snapshot.days, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "tce-go-materials.json"), JSON.stringify(snapshot.materials, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "tce-go-questions.json"), JSON.stringify(snapshot.questions, null, 2) + "\n");
console.log(`Snapshot Edge importado: ${snapshot.publicStats.materialPages} materiais + ${snapshot.publicStats.questionPages} Qxx.`);
