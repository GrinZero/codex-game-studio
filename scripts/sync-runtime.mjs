// Update the owned runtime without reinstalling the plugin or touching project data.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
const repo = process.cwd();
const base = path.join(
  os.homedir(),
  ".local/share/codex-integrations/game-studio-local",
);
const runtime = path.join(base, "runtime");
const configPath = path.join(base, "plugins/game-studio/.mcp.json");
const config = JSON.parse(readFileSync(configPath, "utf8")).mcpServers[
  "game-studio"
];
if (
  config.cwd !== runtime ||
  !config.args.includes(path.join(runtime, "src/server/mcp.ts"))
)
  throw new Error("Runtime configuration differs; inspect before updating.");
if (!existsSync(path.join(repo, "dist/mcp/index.html")))
  throw new Error("Build first.");
const backup = path.join(base, "backups", `resources-${Date.now()}`);
mkdirSync(backup, { recursive: true });
for (const entry of [
  "src",
  "dist",
  "package.json",
  "package-lock.json",
  "README.md",
  "docs",
  "scripts",
  "AGENTS.md",
]) {
  if (existsSync(path.join(runtime, entry)))
    cpSync(path.join(runtime, entry), path.join(backup, entry), {
      recursive: true,
    });
  cpSync(path.join(repo, entry), path.join(runtime, entry), {
    recursive: true,
  });
}
const sync = spawnSync(
  "/usr/bin/rsync",
  ["-a", path.join(repo, "node_modules/"), path.join(runtime, "node_modules/")],
  { stdio: "inherit" },
);
if (sync.status !== 0) throw new Error("Dependency sync failed.");
cpSync(
  path.join(repo, "skills/resource-creation"),
  path.join(base, "plugins/game-studio/skills/resource-creation"),
  { recursive: true },
);
const stamp = {
  build: readFileSync(path.join(repo, "src/shared/version.ts"), "utf8").match(
    /studioVersionMarker = "([^"]+)"/,
  )[1],
  runtime,
  backup,
  syncedAt: new Date().toISOString(),
};
writeFileSync(
  path.join(runtime, "runtime-update.json"),
  JSON.stringify(stamp, null, 2),
);
console.log(JSON.stringify(stamp));
