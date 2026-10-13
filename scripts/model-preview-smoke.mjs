import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";

function animatedModel() {
  const source = readFileSync("samples/preview-mesh.glb");
  const jsonSize = source.readUInt32LE(12);
  const model = JSON.parse(source.subarray(20, 20 + jsonSize).toString());
  const originalBin = source.subarray(28 + jsonSize);
  const times = new Float32Array([0, 1, 2]);
  const moves = new Float32Array([0, 0, 0, 0, 0.3, 0, 0, 0, 0]);
  const bin = Buffer.concat([
    originalBin,
    Buffer.from(times.buffer),
    Buffer.from(moves.buffer),
  ]);
  const timeView = model.bufferViews.length;
  model.bufferViews.push(
    { buffer: 0, byteOffset: originalBin.length, byteLength: times.byteLength },
    {
      buffer: 0,
      byteOffset: originalBin.length + times.byteLength,
      byteLength: moves.byteLength,
    },
  );
  const timeAccessor = model.accessors.length;
  model.accessors.push(
    {
      bufferView: timeView,
      componentType: 5126,
      count: 3,
      type: "SCALAR",
      min: [0],
      max: [2],
    },
    { bufferView: timeView + 1, componentType: 5126, count: 3, type: "VEC3" },
  );
  model.animations = ["Idle", "Jump"].map((name) => ({
    name,
    samplers: [{ input: timeAccessor, output: timeAccessor + 1 }],
    channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
  }));
  model.buffers[0].byteLength = bin.length;
  const raw = Buffer.from(JSON.stringify(model));
  const json = Buffer.concat([
    raw,
    Buffer.alloc((4 - (raw.length % 4)) % 4, 32),
  ]);
  const header = Buffer.from(source.subarray(0, 20));
  header.writeUInt32LE(28 + json.length + bin.length, 8);
  header.writeUInt32LE(json.length, 12);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, binHeader, bin]);
}

export async function verifyModelPreview({
  page,
  ui = page,
  readSnapshot,
  prefix,
}) {
  const name = "模型预览验收";
  await ui.locator("input[type=file]").setInputFiles({
    name: "preview.glb",
    mimeType: "model/gltf-binary",
    buffer: animatedModel(),
  });
  await ui
    .getByRole("dialog")
    .getByLabel("资源名称", { exact: true })
    .fill(name);
  await ui.getByRole("button", { name: "导入并登记版本", exact: true }).click();
  const expand = ui
    .locator(".asset-dock")
    .getByRole("button", { name: "展开全部", exact: true });
  if (await expand.isVisible()) await expand.click();
  await ui.getByRole("button", { name: `${name} 3D 模型 · v1` }).click();
  const inspector = ui.locator(".asset-preview model-viewer");
  await expect
    .poll(() => inspector.evaluate((el) => el.loaded), { timeout: 30000 })
    .toBe(true);
  assert.equal(await inspector.evaluate((el) => el.paused), false);
  const clips = ui
    .locator(".asset-preview")
    .getByRole("combobox", { name: `${name} 动画` });
  await clips.selectOption("Jump");
  assert.equal(await inspector.evaluate((el) => el.animationName), "Jump");
  // Disable automatic rotation so only the user's gesture can change the camera.
  await inspector.evaluate((el) => {
    el.autoRotate = false;
  });
  const theta = await inspector.evaluate((el) => el.getCameraOrbit().theta);
  let bounds = await inspector.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 70,
    bounds.y + bounds.height / 2 + 20,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect
    .poll(() => inspector.evaluate((el) => el.getCameraOrbit().theta))
    .not.toBe(theta);
  const radius = await inspector.evaluate((el) => el.getCameraOrbit().radius);
  await page.mouse.wheel(0, -120);
  await expect
    .poll(() => inspector.evaluate((el) => el.getCameraOrbit().radius))
    .not.toBe(radius);

  await ui.getByRole("button", { name: "添加到当前画布", exact: true }).click();
  await ui.getByRole("button", { name: "fit view" }).click();
  const card = ui.locator(".asset-node").filter({ hasText: name });
  const canvasViewer = card.locator("model-viewer");
  await expect
    .poll(() => canvasViewer.evaluate((el) => el.loaded), { timeout: 30000 })
    .toBe(true);
  assert.equal(await canvasViewer.evaluate((el) => el.cameraControls), true);
  assert.equal(await canvasViewer.evaluate((el) => el.autoRotate), true);
  await card
    .getByRole("combobox", { name: `${name} 动画` })
    .selectOption("Jump");
  assert.equal(await canvasViewer.evaluate((el) => el.animationName), "Jump");
  await canvasViewer.evaluate((el) => {
    el.autoRotate = false;
  });
  const canvasTheta = await canvasViewer.evaluate(
    (el) => el.getCameraOrbit().theta,
  );
  const before = await readSnapshot();
  const asset = before.assets.find((asset) => asset.name === name);
  const canvas = before.canvases.find((canvas) =>
    canvas.nodes.some((node) => node.data.assetId === asset.id),
  );
  const node = canvas.nodes.find((node) => node.data.assetId === asset.id);
  bounds = await canvasViewer.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 60,
    bounds.y + bounds.height / 2 + 40,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect
    .poll(() => canvasViewer.evaluate((el) => el.getCameraOrbit().theta))
    .not.toBe(canvasTheta);
  assert.deepEqual(
    (await readSnapshot()).canvases
      .find((c) => c.id === canvas.id)
      .nodes.find((n) => n.id === node.id).position,
    node.position,
  );
  await card.getByRole("button", { name: `放大查看 ${name}` }).click();
  const dialog = ui.getByRole("dialog", { name: `模型预览 ${name}` });
  await expect(dialog).toBeVisible();
  const enlarged = dialog.locator("model-viewer");
  await expect
    .poll(() => enlarged.evaluate((el) => el.loaded), { timeout: 30000 })
    .toBe(true);
  await dialog.getByRole("button", { name: "自动旋转：开" }).click();
  assert.equal(await enlarged.evaluate((el) => el.autoRotate), false);
  await dialog.getByRole("button", { name: "暂停动画" }).click();
  assert.equal(await enlarged.evaluate((el) => el.paused), true);
  await dialog.getByRole("button", { name: "重置视角" }).click();
  await dialog.getByRole("button", { name: "关闭模型预览" }).click();
  await expect(dialog).toHaveCount(0);
  await ui.getByRole("button", { name: "fit view" }).click();

  // Updating the library must leave the model on the canvas pinned to v1.
  const pinnedSource = await canvasViewer.evaluate((el) => el.src);
  if (prefix === "mcp") {
    assert.equal(await inspector.evaluate((el) => el.src), pinnedSource);
  }
  await card.locator(".node-caption").click();
  await ui.getByRole("button", { name: "导入新版本", exact: true }).click();
  await ui
    .locator("input[type=file]")
    .setInputFiles("samples/preview-mesh.glb");
  await ui
    .getByRole("dialog")
    .getByLabel("资源名称", { exact: true })
    .fill(name);
  await ui.getByRole("button", { name: "导入并登记版本", exact: true }).click();
  await ui.getByRole("button", { name: `${name} 3D 模型 · v2` }).click();
  await expect
    .poll(() => inspector.evaluate((el) => el.src))
    .not.toBe(pinnedSource);
  await expect
    .poll(() => inspector.evaluate((el) => el.loaded), { timeout: 30000 })
    .toBe(true);
  assert.notEqual(await inspector.evaluate((el) => el.src), pinnedSource);
  const latestSource = await inspector.evaluate((el) => el.src);
  assert.equal(await canvasViewer.evaluate((el) => el.src), pinnedSource);
  assert.equal(await clips.count(), 0);
  assert.equal(
    (await readSnapshot()).canvases
      .find((c) => c.id === canvas.id)
      .nodes.find((n) => n.id === node.id).data.revisionId,
    node.data.revisionId,
  );
  // A real loader failure is shown, and switching source clears the error state.
  await inspector.evaluate((el) => {
    el.src = URL.createObjectURL(new Blob(["invalid glb"]));
  });
  await ui
    .locator(".asset-preview")
    .getByRole("alert")
    .filter({ hasText: "无法显示此模型" })
    .waitFor();
  await card.locator(".node-caption").click();
  await expect
    .poll(() => inspector.evaluate((el) => el.loaded), { timeout: 30000 })
    .toBe(true);
  if (prefix === "mcp") {
    assert.equal(await canvasViewer.evaluate((el) => el.src), pinnedSource);
    assert.equal(await inspector.evaluate((el) => el.src), pinnedSource);
    assert.equal(
      await inspector.evaluate(
        (_el, url) => window.__revokedAssetUrls.includes(url),
        latestSource,
      ),
      true,
    );
    assert.equal(
      await inspector.evaluate(
        (_el, url) => window.__revokedAssetUrls.includes(url),
        pinnedSource,
      ),
      false,
    );
  }
  assert.equal(
    await ui.locator(".asset-preview").getByRole("alert").count(),
    0,
  );
  await page.screenshot({ path: `var/qa/${prefix}-canvas-model-preview.png` });
}
