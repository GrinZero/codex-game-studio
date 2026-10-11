import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const dir = mkdtempSync(path.join(os.tmpdir(), "studio-categories-"));
const listen = async (server) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
};
const probe = createServer();
const port = await listen(probe);
await new Promise((resolve) => probe.close(resolve));
const env = {
  ...process.env,
  STUDIO_HOME: path.join(dir, "registry"),
  PORT: String(port),
};
const http = spawn(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "src/server/http.ts", "--production"],
  { env, stdio: "pipe" },
);
const base = `http://127.0.0.1:${port}`;
const client = new Client({ name: "category-check", version: "1.0.0" });
let browser;
let hostServer;
async function tool(name, args) {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result));
  return result.structuredContent.result;
}
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("HTTP service startup timed out")),
      20000,
    );
    http.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Open Game Studio →")) {
        clearTimeout(timer);
        resolve();
      }
    });
    http.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("HTTP service exited"));
    });
  });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["node_modules/tsx/dist/cli.mjs", "src/server/mcp.ts"],
      env,
      stderr: "pipe",
    }),
  );
  const project = await tool("project_manage", {
    action: "create",
    name: "分类验收",
    root: path.join(dir, "game"),
  });
  const png = readFileSync("samples/reference.png").toString("base64");
  for (const name of ["主角 · 法杖", "针叶树 · 高大型", "主角 · 角色本体"])
    await tool("studio_ui_request", {
      path: `/api/projects/${project.id}/import`,
      method: "POST",
      body: { name, files: [{ name: "ref.png", base64: png }] },
    });
  const before = await tool("project_open", { projectId: project.id });
  const resource = (
    await client.readResource({ uri: "ui://game-studio/workbench" })
  ).contents[0].text;
  const bridge = await build({
    stdin: {
      contents: `
    import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
    const iframe = document.querySelector('iframe');
    const bridge = new AppBridge(null, {name:'test-host',version:'1.0.0'}, {serverTools:{}}, {hostContext:{theme:'dark',displayMode:'fullscreen'}});
    bridge.oncalltool = async args => (await fetch('/tool', {method:'POST',body:JSON.stringify(args)})).json();
    await bridge.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow));
    iframe.srcdoc = await (await fetch('/resource')).text();
  `,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
  });
  hostServer = createServer(async (req, res) => {
    try {
      if (req.url === "/tool") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const args = JSON.parse(Buffer.concat(chunks).toString());
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(await client.callTool(args)));
      } else if (req.url === "/resource") {
        res.setHeader("Content-Type", "text/html");
        res.end(resource);
      } else if (req.url === "/bridge.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(bridge.outputFiles[0].text);
      } else {
        res.setHeader("Content-Type", "text/html");
        res.end(
          '<style>body{margin:0}iframe{border:0;width:100vw;height:100vh}</style><iframe></iframe><script type="module" src="/bridge.js"></script>',
        );
      }
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error));
    }
  });
  const hostPort = await listen(hostServer);
  browser = await chromium.launch({ headless: true });
  mkdirSync("var/qa", { recursive: true });
  for (const embedded of [false, true]) {
    const label = embedded ? "mcp" : "http";
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(embedded ? `http://127.0.0.1:${hostPort}` : base);
    const ui = embedded ? page.frameLocator("iframe") : page;
    await ui.locator(".project-card").filter({ hasText: "分类验收" }).click();
    const dock = ui.locator(".asset-dock");
    const equipment = dock.getByRole("button", {
      name: "装备，1 个资源",
    });
    await equipment.waitFor();
    assert.equal(await equipment.getAttribute("aria-expanded"), "false");
    assert.equal(await dock.locator(".dock-asset").count(), 0);
    await equipment.click();
    const wand = dock.getByRole("button", {
      name: "主角 · 法杖 图片 · v1",
    });
    await wand.click();
    await ui.getByLabel("用途分类", { exact: true }).selectOption("道具");
    await dock
      .getByRole("button", { name: "道具，1 个资源", exact: true })
      .waitFor();
    const saved = await tool("project_open", { projectId: project.id });
    const asset = saved.assets.find((a) => a.name === "主角 · 法杖");
    assert.ok(asset.tags.includes("分类:道具"));
    assert.deepEqual(
      asset.revisions,
      before.assets.find((a) => a.id === asset.id).revisions,
    );
    await page.reload();
    await ui.locator(".project-card").filter({ hasText: "分类验收" }).click();
    await dock
      .getByRole("button", { name: "道具，1 个资源", exact: true })
      .waitFor();
    await dock.getByPlaceholder("搜索资源…").fill("道具");
    await dock
      .getByRole("button", { name: "主角 · 法杖 图片 · v1" })
      .click();
    assert.equal(await dock.locator(".dock-asset").count(), 1);
    await ui.getByLabel("用途分类", { exact: true }).selectOption("auto");
    await dock.getByPlaceholder("搜索资源…").fill("植被");
    await dock
      .getByRole("button", { name: "针叶树 · 高大型 图片 · v1" })
      .waitFor();
    assert.equal(await dock.locator(".dock-asset").count(), 1);
    await dock.getByPlaceholder("搜索资源…").fill("找不到的名称");
    await dock.getByText("没有匹配的资源，试试其他名称或分类。").waitFor();
    await dock.getByPlaceholder("搜索资源…").fill("");
    await dock.getByRole("button", { name: "展开全部", exact: true }).click();
    assert.equal(await dock.locator(".dock-asset").count(), 3);
    await dock.getByRole("button", { name: "收起全部", exact: true }).click();
    await page.screenshot({ path: `var/qa/categories-${label}.png` });
    await ui.getByRole("button", { name: "资源", exact: true }).click();
    await ui.getByLabel("筛选用途分类").selectOption("植被");
    assert.equal(await ui.locator(".asset-tile").count(), 1);
    // A resource-page format filter must not hide other canvas resources.
    await ui
      .locator(".filter-tabs")
      .getByRole("button", { name: "3D 模型", exact: true })
      .click();
    await ui.getByRole("button", { name: "画布", exact: true }).click();
    await dock.getByRole("button", { name: "展开全部", exact: true }).click();
    assert.equal(await dock.locator(".dock-asset").count(), 3);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS ${label}: grouping, collapse, search, saved manual override, reload, unchanged revisions, category filter, canvas filter isolation`,
    );
  }
} finally {
  if (browser) await browser.close();
  if (hostServer) await new Promise((resolve) => hostServer.close(resolve));
  await client.close();
  http.kill();
  await new Promise((resolve) => {
    if (http.exitCode !== null) resolve();
    else http.once("exit", resolve);
  });
  rmSync(dir, { recursive: true, force: true });
}
