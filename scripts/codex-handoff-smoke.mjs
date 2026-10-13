import assert from "node:assert/strict";
import path from "node:path";

export async function verifyCodexHandoff({
  page,
  ui = page,
  readSnapshot,
  prefix,
}) {
  const before = await readSnapshot();
  const canvas = before.canvases.find((c) =>
    c.nodes.some((n) => n.type === "workflow"),
  );
  const asset = canvas.nodes.find((n) => n.type === "asset");
  const note = canvas.nodes.find((n) => n.type === "note");
  const record = before.assets.find((a) => a.id === asset.data.assetId);
  const pinned = record.revisions.find((r) => r.id === asset.data.revisionId);
  assert.notEqual(
    record.latestRevisionId,
    pinned.id,
    "验收需包含尚未采用的新版本",
  );
  const node = (id) => ui.locator(`.react-flow__node[data-id="${id}"]`);
  await node(asset.id).click({ button: "right" });
  await ui
    .getByRole("menuitem", { name: "添加到对话引用…", exact: true })
    .click();
  const dialog = ui.getByRole("dialog", { name: "添加对话引用", exact: true });
  await dialog.getByRole("button", { name: "复制引用", exact: true }).waitFor();
  await dialog.locator("summary").click();
  const preview = dialog.getByRole("textbox", {
    name: "引用详情",
    exact: true,
  });
  const text = await preview.inputValue();
  assert.ok(text.includes(pinned.id));
  assert.ok(!text.includes(record.latestRevisionId));
  assert.ok(
    text.includes(path.join(before.project.root, pinned.files[0].relativePath)),
  );
  assert.ok(!text.includes("请继续这个"));
  assert.ok(!text.includes('"sha256"'));
  assert.ok(text.includes(before.project.id));
  await page.screenshot({
    path: path.resolve(`var/qa/${prefix}-codex-handoff.png`),
  });
  // Exercise both clipboard paths without touching the user's clipboard.
  await dialog.evaluate(() => {
    window.__originalHandoffClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__copiedHandoff = text;
        },
      },
    });
  });
  try {
    await dialog.getByRole("button", { name: "复制引用", exact: true }).click();
    await dialog
      .getByRole("button", { name: "已复制引用", exact: true })
      .waitFor();
    assert.equal(
      await dialog.evaluate(() => window.__copiedHandoff),
      await preview.inputValue(),
    );
    await dialog.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("Permission denied");
          },
        },
      }),
    );
    await dialog
      .getByRole("button", { name: "已复制引用", exact: true })
      .click();
    await dialog
      .getByRole("alert")
      .filter({ hasText: "剪贴板访问受限" })
      .waitFor();
    assert.deepEqual(
      await preview.evaluate((field) => [
        field.selectionStart,
        field.selectionEnd,
        document.activeElement === field,
      ]),
      [0, (await preview.inputValue()).length, true],
    );
  } finally {
    await dialog.evaluate(() => {
      if (window.__originalHandoffClipboard)
        Object.defineProperty(
          navigator,
          "clipboard",
          window.__originalHandoffClipboard,
        );
      else delete navigator.clipboard;
    });
  }
  if (ui !== page) {
    // Verify actual MCP protocol delivery and rollback on host rejection.
    await page.evaluate(() => {
      window.__rejectReferenceUpdate = true;
    });
    await dialog.getByRole("button", { name: "添加引用", exact: true }).click();
    await dialog
      .getByRole("alert")
      .filter({ hasText: "引用更新被宿主拒绝" })
      .waitFor();
    assert.equal(
      await ui.getByRole("complementary", { name: "当前对话引用" }).count(),
      0,
    );
    await page.evaluate(() => {
      window.__rejectReferenceUpdate = false;
    });
    await dialog.getByRole("button", { name: "添加引用", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    const bar = ui.getByRole("complementary", { name: "当前对话引用" });
    await bar.waitFor();
    const delivered = await page.evaluate(
      () => window.__referenceUpdates.at(-1).content[0].text,
    );
    assert.ok(delivered.includes(pinned.id));
    assert.ok(!delivered.includes(record.latestRevisionId));
    await page.evaluate(() => {
      window.__rejectReferenceUpdate = true;
    });
    await bar.getByRole("button", { name: /移除引用/ }).click();
    await bar
      .getByRole("alert")
      .filter({ hasText: "引用更新被宿主拒绝" })
      .waitFor();
    assert.equal(await bar.locator(".codex-reference-chip").count(), 1);
    await page.evaluate(() => {
      window.__rejectReferenceUpdate = false;
    });
  } else {
    assert.equal(
      await dialog
        .getByRole("button", { name: "添加引用", exact: true })
        .count(),
      0,
    );
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  }
  await node(asset.id).click();
  await node(note.id).click({ modifiers: ["Shift"] });
  await ui.getByRole("button", { name: "添加引用 · 2", exact: true }).click();
  await dialog.locator(".handoff-items").waitFor();
  assert.equal(await dialog.locator(".handoff-item").count(), 2);
  await dialog.locator("summary").click();
  assert.ok((await preview.inputValue()).includes(note.data.text));
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await dialog.boundingBox();
  const iframeBounds =
    ui === page ? { x: 0 } : await page.locator("iframe").boundingBox();
  assert.ok(bounds.x >= iframeBounds.x && bounds.x + bounds.width <= 390);
  await page.screenshot({
    path: path.resolve(`var/qa/${prefix}-codex-handoff-mobile.png`),
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  if (ui !== page) {
    await dialog.getByRole("button", { name: "添加引用", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    const bar = ui.getByRole("complementary", { name: "当前对话引用" });
    assert.equal(await bar.locator(".codex-reference-chip").count(), 2);
    const combined = await page.evaluate(
      () => window.__referenceUpdates.at(-1).content[0].text,
    );
    assert.ok(combined.includes(note.data.text));
    assert.ok(combined.includes(pinned.id));
    await bar.getByRole("button", { name: "清空引用", exact: true }).click();
    await bar.waitFor({ state: "hidden" });
    assert.ok(
      (
        await page.evaluate(
          () => window.__referenceUpdates.at(-1).content[0].text,
        )
      ).includes("用户已移除全部工作台引用"),
    );
  } else {
    await dialog.press("Escape");
    await dialog.waitFor({ state: "hidden" });
  }
  await node(asset.id).click();
  const after = await readSnapshot();
  assert.equal(
    after.canvases.find((c) => c.id === canvas.id).graphRevision,
    canvas.graphRevision,
  );
  assert.equal(after.assets.length, before.assets.length);
  console.log(
    `PASS: ${prefix} Codex references preserve pinned versions, multi-selection, clipboard fallback and mobile layout; embedded host verifies context delivery, accumulation, clearing and rejection rollback.`,
  );
}
