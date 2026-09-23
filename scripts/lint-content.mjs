import fs from "node:fs";
import path from "node:path";

const roots = ["src", "scripts"];
const files = [];
for (const root of roots) collect(root, files);
let failed = false;
const forbiddenMarkers = ["TO" + "DO", "FIX" + "ME"];

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  if (forbiddenMarkers.some((marker) => new RegExp(`\\b${marker}\\b`).test(source))) {
    console.error(`${file}: marcador de pendência não permitido em release`);
    failed = true;
  }
  if (/sk-[A-Za-z0-9_-]{20,}/.test(source)) {
    console.error(`${file}: possível secret detectado`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`Lint editorial/técnico: ${files.length} arquivos verificados.`);

function collect(current, out) {
  if (!fs.existsSync(current)) return;
  const stat = fs.statSync(current);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(current)) collect(path.join(current, name), out);
  } else if (/\.(mjs|ts|tsx)$/.test(current)) out.push(current);
}
