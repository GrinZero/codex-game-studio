import assert from "node:assert/strict";

export async function verifyCanvasInputs({
  page,
  ui = page,
  readSnapshot,
  prefix,
}) {
  const before = await readSnapshot();
  const canvas = before.canvases.find((c) =>
    c.nodes.some((n) => n.type === "workflow"),
  );
  const workflow = canvas.nodes.find((n) => n.type === "workflow");
  const note = canvas.nodes.find((n) => n.type === "note");
  const image = canvas.nodes.find((n) => n.type === "asset");
  assert.ok(
    canvas.edges.some((e) => e.source === image.id && e.target === workflow.id),
  );
  await ui.getByRole("button", { name: "fit view" }).click();
  const source = ui.locator(
    `.react-flow__node[data-id="${note.id}"] .react-flow__handle.source`,
  );
  const target = ui.locator(
    `.react-flow__node[data-id="${workflow.id}"] .react-flow__handle.target`,
  );
  await source.click();
  await target.click();
  let snapshot;
  for (let i = 0; i < 30; i++) {
    snapshot = await readSnapshot();
    if (
      snapshot.canvases
        .find((c) => c.id === canvas.id)
        .edges.some((e) => e.source === note.id && e.target === workflow.id)
    )
      break;
    await page.waitForTimeout(100);
  }
  assert.ok(
    snapshot.canvases
      .find((c) => c.id === canvas.id)
      .edges.some((e) => e.source === note.id && e.target === workflow.id),
    "UI connection must persist a real input",
  );
  await ui.locator(`.react-flow__node[data-id="${workflow.id}"]`).click();
  await ui
    .getByRole("region", { name: "本次制作输入" })
    .getByText(note.data.title, { exact: true })
    .waitFor();
  await ui.getByRole("button", { name: "开始制作", exact: true }).click();
  const plan = ui.getByRole("dialog", { name: "确认制作输入" });
  await plan.waitFor();
  await plan.getByText("查看文字内容", { exact: true }).click();
  await plan.getByText(note.data.text, { exact: true }).waitFor();
  await page.screenshot({ path: `var/qa/${prefix}-input-plan.png` });
  await plan.getByRole("button", { name: "确认并开始", exact: true }).click();
  await ui.getByRole("region", { name: "已冻结的制作输入" }).waitFor();
  snapshot = await readSnapshot();
  const run = snapshot.runs.find(
    (r) => r.instanceId === workflow.data.instanceId,
  );
  assert.deepEqual(run.inputRevisionIds, [image.data.revisionId]);
  assert.match(
    run.inputSnapshot.prompt,
    new RegExp(
      note.data.text.split("\n")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ),
  );
  assert.deepEqual(run.steps[0].inputRevisionIds, run.inputRevisionIds);
  await page.screenshot({ path: `var/qa/${prefix}-input-frozen.png` });
}
