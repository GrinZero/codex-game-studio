import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const cache = path.join(
  os.homedir(),
  ".codex/plugins/cache/game-studio-local/game-studio/0.1.7",
);
const config = JSON.parse(readFileSync(path.join(cache, ".mcp.json"), "utf8"))
  .mcpServers["game-studio"];
const client = new Client({ name: "installed-asset-check", version: "1.0.0" });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  await client.connect(
    new StdioClientTransport({
      command: config.command,
      args: config.args,
      cwd: config.cwd,
      env: { ...process.env, ...config.env },
      stderr: "pipe",
    }),
  );
  assert.equal(client.getServerVersion().version, "0.1.7");
  const resource = (
    await client.readResource({ uri: "ui://game-studio/workbench" })
  ).contents[0];
  assert.ok(
    resource._meta.ui.csp.connectDomains.includes("http://127.0.0.1:4310"),
  );
  const expectedHtml = readFileSync("dist/mcp/index.html", "utf8");
  assert.equal(sha256(resource.text), sha256(expectedHtml));
  const projects = (
    await client.callTool({ name: "studio_open", arguments: {} })
  ).structuredContent.result.projects;
  let verified = false;
  for (const project of projects.filter(
    (project) => !project.archived && project.available,
  )) {
    const snapshot = (
      await client.callTool({
        name: "project_open",
        arguments: { projectId: project.id },
      })
    ).structuredContent.result;
    const model = snapshot.assets.find(
      (asset) =>
        asset.kind === "model" &&
        asset.revisions[0]?.files.some(
          (file) => file.mime === "model/gltf-binary",
        ),
    );
    if (!model) continue;
    const revision = model.revisions[0];
    const index = revision.files.findIndex(
      (file) => file.mime === "model/gltf-binary",
    );
    const result = await client.callTool({
      name: "studio_ui_request",
      arguments: {
        path: `/api/projects/${project.id}/files/${revision.id}/${index}/http`,
        method: "GET",
      },
    });
    assert.ok(!result.isError);
    const file = result.structuredContent.result;
    const response = await fetch(file.url, { headers: { Origin: "null" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, file.total);
    assert.equal(sha256(bytes), revision.files[index].sha256);
    console.log(
      `PASS: installed MCP 0.1.7, current embedded HTML/CSP, binary HTTP read of ${bytes.length} bytes from ${project.name}; original model hash verified.`,
    );
    verified = true;
    break;
  }
  assert.ok(verified, "No registered GLB available for read-only verification");
} finally {
  await client.close();
}
