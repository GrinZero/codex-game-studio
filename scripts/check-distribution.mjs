import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const source = readFileSync("src/shared/version.ts", "utf8");
const marker = source.match(/studioVersionMarker = "([^"]+)"/)[1];
assert.match(
  marker,
  new RegExp(`^v${version.replaceAll(".", "\\.")}-\\d{14}$`),
);
assert.ok(
  readFileSync("dist/mcp/index.html", "utf8").includes(marker),
  "MCP workbench version differs",
);
const httpScripts = readdirSync("dist/ui/assets")
  .filter((file) => file.endsWith(".js"))
  .map((file) => readFileSync(`dist/ui/assets/${file}`, "utf8"));
assert.ok(
  httpScripts.some((script) => script.includes(marker)),
  "HTTP workbench version differs",
);
console.log(`HTTP and MCP workbenches match ${marker}`);
