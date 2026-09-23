import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("scripts server-side têm sintaxe Node válida", () => {
  const files = fs.readdirSync("scripts")
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => path.join("scripts", name));

  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
  }
});
