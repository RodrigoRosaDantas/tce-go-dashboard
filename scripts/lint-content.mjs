import fs from "node:fs";
import path from "node:path";

const roots = ["src", "scripts"];
const files = [];
for (const root of roots) collect(root, files);
let failed = false;

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (/\b(TODO|FIXME)\b/.test(text)) {
    console.error(`${file}: marcador TODO/FIXME não permitido em release`);
    failed = true;
  }
  if (/sk-[A-Za-z0-9_-]{20,}/.test(text)) {
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
