import assert from "node:assert/strict";

export async function verifyLongNote({
  page,
  ui = page,
  readSnapshot,
  prefix,
}) {
  const before = await readSnapshot();
  const canvas = before.canvases.find((c) =>
    c.nodes.some((n) => n.type === "note"),
  );
  const note = canvas.nodes.find((n) => n.type === "note");
  const card = ui.locator(`.react-flow__node[data-id="${note.id}"]`);
  const readNote = async () =>
    (await readSnapshot()).canvases
      .find((c) => c.id === canvas.id)
      .nodes.find((n) => n.id === note.id);
  const longText = `火焰马 · 超长提示词\n\n${"1. 保留火焰的颜色、形状与运动方向。\n\n".repeat(420)}${"unbroken".repeat(600)}\n<script>never execute</script>\n全文结尾 🔥`;
  const edit = async (text) => {
    await card.click({ button: "right" });
    await ui.getByRole("menuitem", { name: "编辑便签", exact: true }).click();
    await ui.getByRole("dialog").getByLabel("内容", { exact: true }).fill(text);
    await ui
      .getByRole("dialog")
      .getByRole("button", { name: "保存", exact: true })
      .click();
    await ui.getByRole("dialog").waitFor({ state: "hidden" });
  };
  await ui.getByRole("button", { name: "fit view" }).click();
  const rename = async () => {
    await card.click({ button: "right" });
    await ui.getByRole("menuitem", { name: "重命名便签", exact: true }).click();
  };
  await rename();
  const renameDialog = ui.getByRole("dialog");
  const titleInput = renameDialog.getByLabel("便签名称", { exact: true });
  assert.equal(await titleInput.inputValue(), note.data.title);
  assert.equal(await titleInput.getAttribute("maxlength"), "120");
  await titleInput.fill("   ");
  assert.equal(
    await renameDialog
      .getByRole("button", { name: "保存", exact: true })
      .isEnabled(),
    false,
  );
  await titleInput.fill("取消的名称");
  await renameDialog.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal((await readNote()).data.title, note.data.title);
  await rename();
  const beforeRename = (await readSnapshot()).canvases.find(
    (c) => c.id === canvas.id,
  );
  const renamedTitle = "火焰马 · 造型要求";
  await titleInput.fill(`  ${renamedTitle}  `);
  await renameDialog.getByRole("button", { name: "保存", exact: true }).click();
  await renameDialog.waitFor({ state: "hidden" });
  assert.equal((await readNote()).data.title, renamedTitle);
  assert.equal((await readNote()).data.text, note.data.text);
  assert.equal(
    await card.locator(".note-node-title").textContent(),
    renamedTitle,
  );
  const renamedCanvas = (await readSnapshot()).canvases.find(
    (c) => c.id === canvas.id,
  );
  assert.deepEqual(renamedCanvas.edges, beforeRename.edges);
  await edit(longText);
  assert.equal((await readNote()).data.text, longText);
  const dimensions = await card
    .locator(".note-node")
    .evaluate((el) => ({ height: el.offsetHeight, width: el.offsetWidth }));
  assert.ok(dimensions.height <= 240, `Long note height: ${dimensions.height}`);
  assert.equal(dimensions.width, 220);
  assert.ok((await card.locator(".note-body").textContent()).length <= 600);
  await card.getByRole("button", { name: "查看全文", exact: true }).click();
  const dialog = ui.getByRole("dialog");
  const fulltext = dialog.getByRole("region", { name: "便签全文内容" });
  assert.equal(await fulltext.textContent(), longText);
  assert.equal(await fulltext.locator("script").count(), 0);
  const layout = await fulltext.evaluate((el) => ({
    scroll: el.scrollHeight > el.clientHeight,
    width: el.clientWidth,
    viewport: window.innerWidth,
  }));
  assert.equal(layout.scroll, true);
  assert.ok(layout.width <= layout.viewport);
  await fulltext.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.screenshot({ path: `var/qa/${prefix}-long-note-preview.png` });
  await dialog.getByRole("button", { name: "编辑", exact: true }).click();
  assert.equal(
    await dialog.getByLabel("便签名称", { exact: true }).inputValue(),
    renamedTitle,
  );
  assert.equal(
    await dialog.getByLabel("内容", { exact: true }).inputValue(),
    longText,
  );
  await dialog
    .getByLabel("内容", { exact: true })
    .fill(`${longText}\n未保存草稿`);
  await dialog.getByRole("button", { name: "预览", exact: true }).click();
  assert.ok((await fulltext.textContent()).endsWith("未保存草稿"));
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal((await readNote()).data.text, longText);
  await card.dblclick();
  await fulltext.waitFor();
  await dialog
    .getByRole("button", { name: "关闭", exact: true })
    .last()
    .click();
  await edit(note.data.text);
  assert.equal((await readNote()).data.text, note.data.text);
  await card.click();
  const inspector = ui.locator(".inspector");
  await inspector.getByLabel("便签名称", { exact: true }).fill(note.data.title);
  await inspector
    .getByRole("button", { name: "保存便签", exact: true })
    .click();
  await card
    .locator(".note-node-title")
    .getByText(note.data.title, { exact: true })
    .waitFor();
  assert.equal((await readNote()).data.title, note.data.title);
  assert.equal((await readNote()).data.text, note.data.text);
  console.log(
    `PASS ${prefix}: note rename/save/cancel and inspector names, unchanged text/connections, bounded long note, full original text, scroll, safe literal content, draft preview/cancel, double-click, edit/save.`,
  );
}
