import assert from "node:assert/strict";

async function verifyGenerationLayout({ page, ui, prefix }) {
  const viewport = page.viewportSize();
  const dialog = ui.getByRole("dialog", { name: "制作图片", exact: true });
  const title = dialog.locator(".resource-references label span").first();
  const originalTitle = await title.textContent();
  await title.evaluate((element) => {
    element.textContent =
      "火焰马 · 主形象与材质参考 / flame-horse-character-reference-with-a-long-file-name";
  });
  try {
    for (const size of [
      viewport,
      { width: 800, height: 540 },
      { width: 360, height: 640 },
    ]) {
      await page.setViewportSize(size);
      const layout = await dialog.evaluate((element) => {
        const rect = (node) => {
          const r = node.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        };
        const row = element.querySelector(".resource-references > label");
        const transparent = element.querySelector(".checkbox-field");
        const body = element.querySelector(".modal-body");
        return {
          dialog: rect(element),
          footer: rect(element.querySelector(".modal-footer")),
          row: rect(row),
          checkbox: rect(row.querySelector("input")),
          title: rect(row.querySelector("span")),
          version: rect(row.querySelector("small")),
          transparent: rect(transparent),
          transparentCheckbox: rect(transparent.querySelector("input")),
          bodyWidth: body.clientWidth,
          bodyScrollWidth: body.scrollWidth,
          windowWidth: innerWidth,
          windowHeight: innerHeight,
        };
      });
      assert.ok(
        layout.checkbox.width <= 20,
        "Reference checkbox must not fill the row",
      );
      assert.ok(
        layout.transparentCheckbox.width <= 20,
        "Transparency checkbox must stay compact",
      );
      assert.ok(
        layout.transparent.height <= 40,
        "Transparency label must share a line with its checkbox",
      );
      assert.ok(
        layout.title.width >= 120,
        "Reference names need readable horizontal space",
      );
      assert.ok(
        layout.title.x >= layout.checkbox.right,
        "Reference name must follow the checkbox",
      );
      assert.ok(
        layout.title.right <= layout.version.x + 1,
        "Version must not overlap the name",
      );
      assert.ok(
        layout.version.right <= layout.row.right,
        "Version must stay inside its row",
      );
      assert.ok(
        layout.bodyScrollWidth <= layout.bodyWidth + 1,
        "Form must not overflow horizontally",
      );
      assert.ok(
        layout.footer.bottom <= layout.windowHeight,
        "Footer must remain visible in short windows",
      );
      assert.ok(
        layout.dialog.right <= layout.windowWidth,
        "Dialog must fit narrow windows",
      );
      await page.screenshot({
        path: `var/qa/${prefix}-generation-${size.width}x${size.height}.png`,
      });
    }
    await dialog
      .getByRole("checkbox", { name: "透明背景", exact: true })
      .check();
    assert.equal(
      await dialog
        .getByRole("checkbox", { name: "透明背景", exact: true })
        .isChecked(),
      true,
    );
    await dialog
      .getByRole("checkbox", { name: "透明背景", exact: true })
      .uncheck();
  } finally {
    await title.evaluate((element, text) => {
      element.textContent = text;
    }, originalTitle);
    await page.setViewportSize(viewport);
  }
}

export async function verifyResourceComposer({
  page,
  ui = page,
  readSnapshot,
  prefix,
}) {
  if (
    !(await ui.getByRole("button", { name: "添加资源", exact: true }).count())
  ) {
    const initial = await readSnapshot();
    await ui
      .locator(".project-card-open")
      .filter({ hasText: initial.project.name })
      .click();
  }
  const add = async () => {
    await ui.getByRole("button", { name: "添加资源", exact: true }).click();
    await ui.getByRole("menu", { name: "添加资源", exact: true }).waitFor();
  };
  await add();
  for (const name of [
    "文档",
    "已有文档",
    "文本",
    "图片",
    "视频",
    "3D 模型",
    "3D 动画",
    "音频",
    "源文件",
    "上传",
    "从资源库添加",
  ])
    assert.equal(
      (await ui.getByRole("menuitem").filter({ hasText: name }).count()) > 0,
      true,
      name,
    );
  await page.screenshot({ path: `var/qa/${prefix}-resource-menu.png` });
  await ui.getByRole("menuitem").filter({ hasText: "编写 Markdown" }).click();
  await ui.getByLabel("文档名称", { exact: true }).fill("画布制作指南");
  await ui
    .getByLabel("文档内容", { exact: true })
    .fill(
      "# 制作指南\n\n- 雪地风格\n- 透明背景\n\n<script>alert('unsafe')</script>",
    );
  await ui
    .getByRole("dialog")
    .getByRole("button", { name: "预览", exact: true })
    .click();
  await ui.getByRole("heading", { name: "制作指南", exact: true }).waitFor();
  assert.equal(await ui.locator(".studio-markdown script").count(), 0);
  await ui.getByRole("button", { name: "保存文档", exact: true }).click();
  await ui.getByRole("dialog").waitFor({ state: "hidden" });
  let s = await readSnapshot();
  const doc = s.assets.find((a) => a.name === "画布制作指南");
  assert.ok(doc);
  const node = s.canvases
    .flatMap((c) => c.nodes)
    .find((n) => n.data.assetId === doc.id);
  assert.ok(node);
  await ui.locator(`.react-flow__node[data-id="${node.id}"]`).dblclick();
  await ui
    .getByLabel("文档内容", { exact: true })
    .fill("# 制作指南\n\n已修订的要求。");
  await ui.getByRole("button", { name: "保存文档", exact: true }).click();
  await ui.getByRole("dialog").waitFor({ state: "hidden" });
  s = await readSnapshot();
  assert.equal(s.assets.find((a) => a.id === doc.id).revisions.length, 2);
  await add();
  await ui
    .getByRole("menuitem")
    .filter({ hasText: "引用项目内已有文档" })
    .click();
  await ui.getByLabel("画布制作指南版本").selectOption(doc.latestRevisionId);
  await ui
    .locator(".resource-library-row")
    .filter({ hasText: "画布制作指南" })
    .getByRole("button", { name: "添加引用" })
    .click();
  await ui.getByRole("dialog").waitFor({ state: "hidden" });
  s = await readSnapshot();
  assert.equal(
    s.canvases.flatMap((c) => c.nodes).filter((n) => n.data.assetId === doc.id)
      .length,
    2,
  );
  for (const [description, title] of [
    ["根据描述与参考生成图片", "制作图片"],
    ["根据描述与参考生成视频", "制作视频"],
    ["从文字或图片制作模型", "制作3D 模型"],
    ["给角色绑定骨架并添加动作", "制作3D 动画"],
    ["制作音乐、音效或语音", "制作音频"],
  ]) {
    await add();
    await ui.getByRole("menuitem").filter({ hasText: description }).click();
    await ui.getByRole("dialog", { name: title, exact: true }).waitFor();
    if (title === "制作3D 动画")
      assert.equal(
        await ui
          .getByRole("button", { name: "保存任务", exact: true })
          .isEnabled(),
        false,
      );
    if (title === "制作图片") {
      await verifyGenerationLayout({ page, ui, prefix });
      await ui.getByLabel("资源名称", { exact: true }).fill("图标制作验收");
      await ui
        .getByLabel("制作描述", { exact: true })
        .fill("雪地游戏的透明图标");
      await ui.getByRole("button", { name: "保存任务", exact: true }).click();
    } else await ui.getByRole("button", { name: "关闭", exact: true }).click();
    await ui.getByRole("dialog").waitFor({ state: "hidden" });
  }
  s = await readSnapshot();
  const t = s.tasks.find((t) => t.name === "图标制作验收");
  assert.equal(t.status, "draft");
  await page.screenshot({ path: `var/qa/${prefix}-resource-canvas.png` });
  assert.ok(
    s.canvases
      .flatMap((c) => c.nodes)
      .some((n) => n.id === t.nodeId && n.type === "generation"),
  );
  console.log(
    `PASS ${prefix}: all resource entries, Markdown edit/preview, immutable document versions, library version reuse, five generation forms and durable draft.`,
  );
}
