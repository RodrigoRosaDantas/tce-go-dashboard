import fs from "node:fs";
import { validateSnapshot } from "./snapshot-contract.mjs";

const file = new URL("../public/data/tce-go-snapshot.json", import.meta.url);
const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
const errors = validateSnapshot(snapshot);

if (errors.length) {
  console.error("Snapshot TCE-GO inválido:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Snapshot válido: ${snapshot.publicStats.totalDays} dias, ${snapshot.publicStats.sessions} sessões, ${snapshot.publicStats.protectedDays} protegidos.`);
