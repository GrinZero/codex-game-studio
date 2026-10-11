import assert from "node:assert/strict";
import path from "node:path";

// Run the same cover interactions in HTTP and the opaque MCP app sandbox.
export async function verifyProjectCover({
  page,
  ui = page,
  project,
  readSnapshot,
}) {
  await ui.getByRole("button", { name: "全部项目", exact: true }).click();
  const card = ui
    .locator(".project-card")
    .filter({ has: ui.getByTitle(project.root, { exact: true }) });
  const openCover = () => card.locator(".project-card-cover-action").click();
  const dialog = ui.getByRole("dialog");
  const save = () =>
    dialog.getByRole("button", { name: "保存封面", exact: true }).click();
  const defaultCover = card.locator(".project-name-cover");
  await defaultCover.waitFor();
  assert.equal(
    await defaultCover.locator(".project-name-cover-title").textContent(),
    project.name,
  );
  const defaultStyle = await defaultCover.getAttribute("style");
  await openCover();
  assert.equal(
    await dialog.locator(".project-name-cover").getAttribute("style"),
    defaultStyle,
  );
  await dialog.locator(".cover-choice").first().click();
  await dialog.locator(".cover-preview img").evaluate((img) => img.decode());
  await save();
  await dialog.waitFor({ state: "hidden" });
  await card.locator(".project-card-cover img").evaluate((img) => img.decode());
  const initial = (await readSnapshot()).project.cover;
  assert.ok(initial?.revisionId);
  await page.reload();
  await card.locator(".project-card-cover img").evaluate((img) => img.decode());
  assert.deepEqual((await readSnapshot()).project.cover, initial);

  await openCover();
  await dialog.getByRole("button", { name: "移除封面", exact: true }).click();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  assert.deepEqual((await readSnapshot()).project.cover, initial);
  await openCover();
  await dialog.getByRole("button", { name: "移除封面", exact: true }).click();
  await save();
  await dialog.waitFor({ state: "hidden" });
  assert.equal((await readSnapshot()).project.cover, undefined);
  await defaultCover.waitFor();
  assert.equal(await defaultCover.getAttribute("style"), defaultStyle);
  await page.reload();
  await defaultCover.waitFor();
  assert.equal(await defaultCover.getAttribute("style"), defaultStyle);

  await openCover();
  await dialog.getByLabel("上传封面图片", { exact: true }).setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("invalid image"),
  });
  await dialog
    .getByRole("alert")
    .filter({ hasText: "无法读取这张图片" })
    .waitFor();
  const before = (await readSnapshot()).assets.length;
  await dialog
    .getByLabel("上传封面图片", { exact: true })
    .setInputFiles(path.resolve("samples/reference.png"));
  await dialog.getByRole("button", { name: "保存封面", exact: true }).waitFor();
  await dialog
    .getByRole("button", { name: "reference.png", exact: true })
    .waitFor();
  assert.equal(
    await dialog
      .getByRole("button", { name: "reference.png", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await dialog.locator(".cover-preview img").evaluate((img) => img.decode());
  await save();
  await dialog.waitFor({ state: "hidden" });
  const uploaded = await readSnapshot();
  assert.equal(uploaded.assets.length, before + 1);
  assert.notEqual(uploaded.project.cover.revisionId, initial.revisionId);
  await card.locator(".project-card-cover img").evaluate((img) => img.decode());

  await card.locator(".project-card-open").click();
  await ui.getByRole("button", { name: "项目设置", exact: true }).click();
  await ui.locator(".settings-cover img").evaluate((img) => img.decode());
  await ui.getByRole("button", { name: "更换封面", exact: true }).click();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await ui.getByRole("button", { name: "全部项目", exact: true }).click();
}
