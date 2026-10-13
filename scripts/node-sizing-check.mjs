import { chromium } from "playwright";
import { mkdtempSync, mkdirSync, copyFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { verifyNodeSizing } from "./node-sizing-smoke.mjs";
const base = process.env.STUDIO_TEST_URL || "http://127.0.0.1:4311";
const invoke = async (tool, args) => {
  const response = await fetch(`${base}/api/tools/${tool}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify(args),
  });
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result));
  return result;
};
const directory = mkdtempSync(path.join(os.tmpdir(), "studio-node-ui-"));
const project = await invoke("project_manage", {
  action: "create",
  name: "节点大小验收",
  root: path.join(directory, "project"),
});
let snapshot = await (await fetch(`${base}/api/projects/${project.id}`)).json();
let canvas = snapshot.canvases[0];
canvas = await invoke("canvas_patch", {
  projectId: project.id,
  canvasId: canvas.id,
  target: "graph",
  expectedRevision: canvas.graphRevision,
  ops: [
    {
      op: "add",
      node: {
        id: "note",
        type: "note",
        position: { x: 80, y: 80 },
        data: { title: "大小测试", text: "内容保持\n".repeat(40) },
      },
    },
    { op: "instantiate", inputNodeIds: ["note"], position: { x: 760, y: 80 } },
  ],
});
await invoke("generation_create", {
  projectId: project.id,
  canvasId: canvas.id,
  expectedRevision: canvas.graphRevision,
  kind: "image",
  name: "尺寸任务",
  prompt: "测试，不启动生成",
  position: { x: 420, y: 80 },
  idempotencyKey: "size-task",
});
copyFileSync(
  "samples/reference.png",
  path.join(directory, "project", "reference.png"),
);
const asset = await invoke("asset_import", {
  projectId: project.id,
  fileRefs: [path.join(directory, "project", "reference.png")],
  name: "图片尺寸",
});
canvas = (await (await fetch(`${base}/api/projects/${project.id}`)).json())
  .canvases[0];
canvas = await invoke("canvas_patch", {
  projectId: project.id,
  canvasId: canvas.id,
  target: "graph",
  expectedRevision: canvas.graphRevision,
  ops: [
    {
      op: "add",
      node: {
        id: "image",
        type: "asset",
        position: { x: 80, y: 600 },
        data: {
          title: "图片尺寸",
          assetId: asset.assetId,
          revisionId: asset.id,
        },
      },
    },
  ],
});
await invoke("document_save", {
  projectId: project.id,
  canvasId: canvas.id,
  expectedRevision: canvas.graphRevision,
  name: "文档尺寸",
  text: "# 文档预览\n\n" + "更多文字\n\n".repeat(30),
  position: { x: 420, y: 600 },
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
mkdirSync("var/qa", { recursive: true });
try {
  await page.goto(base);
  await page
    .getByRole("button")
    .filter({ hasText: "节点大小验收" })
    .first()
    .click();
  await page.locator(".note-node").waitFor();
  const readSnapshot = async () =>
    await (await fetch(`${base}/api/projects/${project.id}`)).json();
  await verifyNodeSizing({ page, readSnapshot, prefix: "focused" });
  for (const node of (await readSnapshot()).canvases[0].nodes.filter(
    (n) => n.type !== "note",
  )) {
    const card = page.locator(`.react-flow__node[data-id="${node.id}"]`);
    await card.click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "设置节点大小", exact: true })
      .click();
    await page.getByLabel("节点宽度").fill("360");
    await page.getByLabel("节点高度").fill("260");
    await page.getByRole("button", { name: "保存大小", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.deepEqual(
      await card
        .locator(".studio-node")
        .evaluate((el) => [el.offsetWidth, el.offsetHeight]),
      [360, 260],
    );
  }
  await page.reload();
  await page
    .getByRole("button")
    .filter({ hasText: "节点大小验收" })
    .first()
    .click();
  for (const node of (await readSnapshot()).canvases[0].nodes.filter(
    (n) => n.type !== "note",
  )) {
    assert.deepEqual(
      await page
        .locator(`.react-flow__node[data-id="${node.id}"] .studio-node`)
        .evaluate((el) => [el.offsetWidth, el.offsetHeight]),
      [360, 260],
    );
  }
  console.log(
    "PASS: image, document, workflow and generation dimensions fill the frame and survive browser reload.",
  );
} catch (error) {
  await page.screenshot({ path: "var/qa/node-sizing-check-failure.png" });
  throw error;
} finally {
  await browser.close();
}
