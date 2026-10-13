import assert from "node:assert/strict";

export async function verifyNodeSizing({
  page,
  ui = page,
  readSnapshot,
  prefix,
}) {
  const original = await readSnapshot();
  const canvas = original.canvases.find((c) =>
    c.nodes.some((n) => n.type === "note"),
  );
  const note = canvas.nodes.find((n) => n.type === "note");
  const card = ui.locator(`.react-flow__node[data-id="${note.id}"]`);
  const saved = async () =>
    (await readSnapshot()).canvases.find((c) => c.id === canvas.id);
  const waitSize = async (width, height) => {
    for (let i = 0; i < 60; i++) {
      const live = (await saved()).nodes.find((n) => n.id === note.id);
      if (
        Math.abs(live.width - width) <= 4 &&
        Math.abs(live.height - height) <= 4
      )
        return live;
      await page.waitForTimeout(100);
    }
    const actual = (await saved()).nodes.find((n) => n.id === note.id);
    throw new Error(
      `Size did not persist: expected ${width} × ${height}, actual ${actual.width} × ${actual.height}`,
    );
  };
  const edit = async () => {
    await card.click({ button: "right" });
    await ui
      .getByRole("menuitem", { name: "设置节点大小", exact: true })
      .click();
  };
  await ui.getByRole("button", { name: /^fit view$/i }).click();
  await edit();
  await ui.getByLabel("节点宽度", { exact: true }).fill("480");
  await ui.getByLabel("节点高度", { exact: true }).fill("320");
  await ui.getByRole("button", { name: "保存大小", exact: true }).click();
  await ui.getByRole("dialog").waitFor({ state: "hidden" });
  await waitSize(480, 320);
  assert.deepEqual(
    await card
      .locator(".studio-node")
      .evaluate((el) => [el.offsetWidth, el.offsetHeight]),
    [480, 320],
  );
  assert.equal((await saved()).graphRevision, canvas.graphRevision);
  await ui.getByRole("button", { name: "撤销布局", exact: true }).click();
  for (
    let i = 0;
    i < 60 &&
    (await saved()).nodes.find((n) => n.id === note.id).width !== undefined;
    i++
  )
    await page.waitForTimeout(100);
  assert.equal(
    (await saved()).nodes.find((n) => n.id === note.id).width,
    undefined,
  );
  await ui.getByRole("button", { name: "重做布局", exact: true }).click();
  await waitSize(480, 320);
  await card.click();
  const corner = card.locator(
    ".react-flow__resize-control.handle.bottom.right",
  );
  const bounds = await corner.boundingBox();
  assert.ok(bounds);
  const scale = await card.evaluate(
    (el) => el.getBoundingClientRect().width / el.offsetWidth,
  );
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 80 * scale,
    bounds.y + bounds.height / 2 + 60 * scale,
    { steps: 10 },
  );
  await page.mouse.up();
  const resized = await waitSize(560, 380);
  const body = await card
    .locator(".studio-node")
    .evaluate((el) => [el.offsetWidth, el.offsetHeight]);
  assert.ok(Math.abs(body[0] - 560) <= 4 && Math.abs(body[1] - 380) <= 4);
  // Left/top controls change position as well as size, and undo restores both.
  await ui.getByText("已保存到本地", { exact: true }).waitFor();
  const nextScale = await card.evaluate(
    (el) => el.getBoundingClientRect().width / el.offsetWidth,
  );
  const topLeft = await card
    .locator(".react-flow__resize-control.handle.top.left")
    .boundingBox();
  await page.mouse.move(
    topLeft.x + topLeft.width / 2,
    topLeft.y + topLeft.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    topLeft.x + topLeft.width / 2 - 40 * nextScale,
    topLeft.y + topLeft.height / 2 - 30 * nextScale,
    { steps: 8 },
  );
  await page.mouse.up();
  const shifted = await waitSize(resized.width + 40, resized.height + 30);
  assert.ok(Math.abs(shifted.position.x - resized.position.x + 40) <= 4);
  assert.ok(Math.abs(shifted.position.y - resized.position.y + 30) <= 4);
  await ui.getByRole("button", { name: "撤销布局", exact: true }).click();
  const undone = await waitSize(resized.width, resized.height);
  assert.deepEqual(undone.position, resized.position);
  await page.screenshot({ path: `var/qa/${prefix}-node-sizing.png` });
  await edit();
  await ui.getByRole("button", { name: "恢复默认大小", exact: true }).click();
  await ui.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    (await saved()).nodes.find((n) => n.id === note.id).width,
    undefined,
  );
  assert.equal(
    await card.locator(".studio-node").evaluate((el) => el.offsetWidth),
    220,
  );
  assert.deepEqual((await saved()).edges, canvas.edges);
  assert.deepEqual(
    (await saved()).nodes.find((n) => n.id === note.id).data,
    note.data,
  );
  console.log(
    `PASS ${prefix}: exact dimensions, drag resize in both directions, position/size undo and redo, persistence and reset without changing inputs.`,
  );
}
