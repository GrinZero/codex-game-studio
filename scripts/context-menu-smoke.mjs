import assert from "node:assert/strict";
import path from "node:path";
import { verifyCodexHandoff } from "./codex-handoff-smoke.mjs";
export async function verifyCanvasContextMenu({
  page,
  ui = page,
  readSnapshot,
  prefix,
  readDownload,
}) {
  const before = await readSnapshot();
  const canvas = before.canvases.find((c) =>
    c.nodes.some((n) => n.type === "workflow"),
  );
  const read = async () =>
    (await readSnapshot()).canvases.find((c) => c.id === canvas.id);
  const wait = async (check) => {
    for (let i = 0; i < 40; i++) {
      const c = await read();
      if (check(c)) {
        await page.waitForTimeout(350);
        await ui.getByText("已保存到本地", { exact: true }).waitFor();
        return c;
      }
      await page.waitForTimeout(100);
    }
    assert.fail("右键操作未保存到画布");
  };
  const menu = ui.getByRole("menu");
  const pane = ui.locator(".react-flow__pane");
  const openPane = async () => {
    const bounds = await pane.boundingBox();
    await pane.click({
      button: "right",
      position: { x: bounds.width - 30, y: 30 },
    });
    await ui.getByRole("menu", { name: "画布操作" }).waitFor();
  };
  await openPane();
  assert.equal(
    await menu
      .getByRole("menuitem", { name: "粘贴节点", exact: true })
      .isEnabled(),
    false,
  );
  await menu.getByRole("menuitem", { name: "添加便签", exact: true }).click();
  await ui
    .getByRole("dialog")
    .getByLabel("内容", { exact: true })
    .fill("右键创建 · 原始内容");
  await ui
    .getByRole("dialog")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await ui.getByRole("dialog").waitFor({ state: "hidden" });
  let c = await wait((c) =>
    c.nodes.some((n) => n.data.text === "右键创建 · 原始内容"),
  );
  const note = c.nodes.find((n) => n.data.text === "右键创建 · 原始内容");
  const node = (id) => ui.locator(`.react-flow__node[data-id="${id}"]`);
  await node(note.id).click({ button: "right" });
  await menu
    .getByRole("menuitem", { name: "编辑便签", exact: true })
    .press("Enter");
  assert.equal(
    await ui
      .getByRole("dialog")
      .getByLabel("内容", { exact: true })
      .inputValue(),
    "右键创建 · 原始内容",
  );
  await ui
    .getByRole("dialog")
    .getByLabel("内容", { exact: true })
    .fill("右键编辑 · 新内容");
  await ui
    .getByRole("dialog")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await wait((c) =>
    c.nodes.some(
      (n) => n.id === note.id && n.data.text === "右键编辑 · 新内容",
    ),
  );
  await ui.getByRole("dialog").waitFor({ state: "hidden" });
  await node(note.id).click({ button: "right" });
  await menu.getByRole("menuitem", { name: "复制节点", exact: true }).click();
  await openPane();
  await menu.getByRole("menuitem", { name: "粘贴节点", exact: true }).click();
  c = await wait((c) => c.nodes.length === canvas.nodes.length + 2);
  assert.equal(
    c.nodes.filter((n) => n.data.text === "右键编辑 · 新内容").length,
    2,
  );
  const asset = canvas.nodes.find((n) => n.type === "asset");
  await node(note.id).click();
  await node(asset.id).click({ modifiers: ["Shift"] });
  await node(asset.id).click({ button: "right" });
  await ui.getByRole("menu", { name: "已选 2 个节点" }).waitFor();
  await page.screenshot({
    path: path.resolve(`var/qa/${prefix}-context-selection.png`),
  });
  await menu.getByRole("menuitem", { name: "创建副本", exact: true }).click();
  c = await wait((c) => c.nodes.length === canvas.nodes.length + 4);
  assert.equal(
    c.nodes.filter((n) => n.data.revisionId === asset.data.revisionId).length,
    2,
  );
  // Remove only the new references; the underlying asset must remain registered.
  for (const n of [...c.nodes]
    .reverse()
    .filter((n) => !canvas.nodes.some((old) => old.id === n.id))) {
    await ui.getByRole("button", { name: "选择", exact: true }).click();
    await node(n.id).locator(".node-heading").click();
    await node(n.id).locator(".node-heading").click({ button: "right" });
    await menu
      .getByRole("menuitem", { name: "从画布移除", exact: true })
      .click();
    await wait((c) => !c.nodes.some((node) => node.id === n.id));
  }
  await node(asset.id).click({ button: "right" });
  if (readDownload) {
    const prior = readDownload();
    await menu
      .getByRole("menuitem", { name: "下载素材主文件", exact: true })
      .click();
    for (let i = 0; i < 40 && readDownload() === prior; i++)
      await page.waitForTimeout(100);
    assert.notEqual(readDownload(), prior, "右键下载需交付给 MCP 宿主");
    assert.ok(readDownload().contents[0].resource.blob);
  } else {
    const pending = page.waitForEvent("download");
    await menu
      .getByRole("menuitem", { name: "下载素材主文件", exact: true })
      .click();
    const download = await pending;
    assert.equal(await download.failure(), null);
    assert.ok(download.suggestedFilename().endsWith(".png"));
  }
  const edge = canvas.edges.find(
    (e) => canvas.nodes.find((n) => n.id === e.source)?.type === "note",
  );
  await ui.getByRole("button", { name: "fit view" }).click();
  await page.waitForTimeout(350); // Let viewport animation and its layout save finish.
  const edgePoint = await ui
    .locator(
      `.react-flow__edge[data-id="${edge.id}"] .react-flow__edge-interaction`,
    )
    .evaluate((path) => {
      const edge = path.closest(".react-flow__edge");
      for (let i = 1; i < 20; i++) {
        const point = path
          .getPointAtLength((path.getTotalLength() * i) / 20)
          .matrixTransform(path.getScreenCTM());
        if (
          document
            .elementFromPoint(point.x, point.y)
            ?.closest(".react-flow__edge") === edge
        )
          return { x: point.x, y: point.y };
      }
      throw new Error("输入连线需有可见可点击的线段");
    });
  const frameBounds =
    ui === page ? { x: 0, y: 0 } : await page.locator("iframe").boundingBox();
  await page.mouse.click(
    edgePoint.x + frameBounds.x,
    edgePoint.y + frameBounds.y,
    { button: "right" },
  );
  await ui.getByRole("menu", { name: "连线操作" }).waitFor();
  await menu
    .getByRole("menuitem", { name: "断开输入连线", exact: true })
    .click();
  await wait((c) => !c.edges.some((e) => e.id === edge.id));
  await node(edge.source).locator(".react-flow__handle.source").click();
  await node(edge.target).locator(".react-flow__handle.target").click();
  await wait((c) =>
    c.edges.some((e) => e.source === edge.source && e.target === edge.target),
  );
  const workflow = canvas.nodes.find((n) => n.type === "workflow");
  await node(workflow.id).click({ button: "right" });
  assert.equal(
    await menu
      .getByRole("menuitem", { name: "创建副本", exact: true })
      .isEnabled(),
    false,
  );
  assert.equal(
    await menu
      .getByRole("menuitem", { name: "从画布移除", exact: true })
      .isEnabled(),
    false,
  );
  await menu
    .getByRole("menuitem", { name: "查看制作流程", exact: true })
    .press("Escape");
  assert.equal(await menu.count(), 0);
  await openPane();
  const chooser = page.waitForEvent("filechooser");
  await menu
    .getByRole("menuitem", { name: "导入素材到此处", exact: true })
    .click();
  await (await chooser).setFiles(path.resolve("samples/reference.png"));
  const importDialog = ui.getByRole("dialog", {
    name: "导入资源",
    exact: true,
  });
  const assetRecord = (await readSnapshot()).assets.find(
    (a) => a.id === asset.data.assetId,
  );
  await importDialog
    .getByLabel("资源名称", { exact: true })
    .fill(assetRecord.name);
  await importDialog.getByLabel("版本归属").selectOption(asset.data.assetId);
  await importDialog
    .getByRole("button", { name: "导入并登记版本", exact: true })
    .click();
  await importDialog.waitFor({ state: "hidden" });
  c = await wait((c) => c.nodes.length === canvas.nodes.length + 1);
  const imported = c.nodes.find(
    (n) => !canvas.nodes.some((old) => old.id === n.id),
  );
  const latestAsset = (await readSnapshot()).assets.find(
    (a) => a.id === asset.data.assetId,
  );
  assert.equal(imported.data.revisionId, latestAsset.latestRevisionId);
  assert.notEqual(imported.data.revisionId, asset.data.revisionId);
  assert.equal(
    c.nodes.find((n) => n.id === asset.id).data.revisionId,
    asset.data.revisionId,
    "导入新版本保留原引用版本",
  );
  await node(imported.id).click({ button: "right" });
  await menu.getByRole("menuitem", { name: "从画布移除", exact: true }).click();
  await wait((c) => !c.nodes.some((n) => n.id === imported.id));
  assert.ok(
    (await readSnapshot()).assets.some((a) => a.id === asset.data.assetId),
  );
  await verifyCodexHandoff({ page, ui, readSnapshot, prefix });
}
