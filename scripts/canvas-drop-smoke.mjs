import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { expect } from "@playwright/test";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM2cAAAAASUVORK5CYII=";
export async function verifyCanvasDrop({
  page,
  ui = page,
  readSnapshot,
  prefix,
}) {
  const area = ui.locator(".canvas-area");
  await area.waitFor();
  await ui.locator(".react-flow__controls-zoomout").click();
  await page.waitForTimeout(500);
  const before = await readSnapshot();
  const known = new Set(
    before.canvases.flatMap((c) => c.nodes.map((n) => n.id)),
  );
  const bounds = await area.boundingBox();
  const point = {
    x: bounds.x + bounds.width * 0.45,
    y: bounds.y + bounds.height * 0.4,
  };
  const send = async (files, data = {}) =>
    area.evaluate(
      (element, { files, data, point, png }) => {
        const areaRect = element.getBoundingClientRect();
        const localPoint = {
          x: Math.trunc(areaRect.left + areaRect.width * 0.45),
          y: Math.trunc(areaRect.top + areaRect.height * 0.4),
        };
        const rect = element
          .querySelector(".react-flow")
          .getBoundingClientRect();
        const matrix = new DOMMatrix(
          getComputedStyle(
            element.querySelector(".react-flow__viewport"),
          ).transform,
        );
        const expected = {
          x: (localPoint.x - rect.left - matrix.e) / matrix.a,
          y: (localPoint.y - rect.top - matrix.f) / matrix.d,
        };
        const transfer = new DataTransfer();
        for (const name of files)
          transfer.items.add(
            new File(
              [Uint8Array.from(atob(png), (c) => c.charCodeAt(0))],
              name,
              { type: "image/png" },
            ),
          );
        for (const [type, value] of Object.entries(data))
          transfer.setData(type, value);
        element.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          }),
        );
        element.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
            clientX: localPoint.x,
            clientY: localPoint.y,
          }),
        );
        return expected;
      },
      { files, data, point, png },
    );
  const added = async () =>
    (await readSnapshot()).canvases
      .flatMap((c) => c.nodes)
      .filter((n) => !known.has(n.id));
  const expected = await send(["聊天参考.png", "第二张.png"], {
    "text/html": '<img src="https://unreadable.invalid/preview.png">',
  });
  await expect.poll(async () => (await added()).length).toBe(2);
  await ui
    .getByRole("status")
    .filter({ hasText: "正在导入图片" })
    .waitFor({ state: "hidden" });
  let nodes = await added();
  assert.ok(Math.abs(nodes[0].position.x - expected.x) < 1);
  assert.ok(
    Math.abs(nodes[0].position.y - expected.y) < 1,
    `drop position: actual ${JSON.stringify(nodes[0].position)}, expected ${JSON.stringify(expected)}`,
  );
  assert.ok(Math.abs(nodes[1].position.x - nodes[0].position.x - 280) < 0.001);
  const hash = createHash("sha256")
    .update(Buffer.from(png, "base64"))
    .digest("hex");
  for (const node of nodes) {
    const snapshot = await readSnapshot();
    const revision = snapshot.assets
      .find((a) => a.id === node.data.assetId)
      .revisions.find((r) => r.id === node.data.revisionId);
    assert.equal(revision.files[0].sha256, hash);
  }
  // Exercise native thumbnail dragging in the HTTP page. For the opaque MCP
  // receiver, deliver the same image HTML payload: headless Chromium does not
  // forward native drag events across this test host's sandbox boundary.
  await page.evaluate((png) => {
    const image = document.createElement("img");
    image.id = "conversation-drag-image";
    image.src = `data:image/png;base64,${png}`;
    image.alt = "聊天缩略图";
    image.draggable = true;
    image.style.cssText =
      "position:fixed;right:12px;top:12px;width:48px;height:48px;z-index:99999;background:white;";
    document.body.append(image);
  }, png);
  await expect
    .poll(() =>
      page
        .locator("#conversation-drag-image")
        .evaluate((image) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await area.evaluate(() => {
    window.__dropOriginalFetch = window.fetch;
    window.fetch = (source, ...args) => {
      if (String(source).startsWith("data:"))
        throw new Error("data: fetch blocked by host CSP");
      return window.__dropOriginalFetch(source, ...args);
    };
  });
  if (ui !== page) {
    const html = await page
      .locator("#conversation-drag-image")
      .evaluate((image) => image.outerHTML);
    await send([], { "text/html": html });
  } else {
    const source = await page.locator("#conversation-drag-image").boundingBox();
    const liveBounds = await area.boundingBox();
    const livePoint = {
      x: liveBounds.x + liveBounds.width * 0.45,
      y: liveBounds.y + liveBounds.height * 0.4,
    };
    await page.mouse.move(source.x + 24, source.y + 24);
    await page.mouse.down();
    await page.mouse.move(source.x + 12, source.y + 36, { steps: 3 });
    await page.mouse.move(livePoint.x, livePoint.y, { steps: 20 });
    await page.mouse.move(livePoint.x + 1, livePoint.y + 1);
    await ui.getByText("松开以添加图片节点", { exact: true }).waitFor();
    await page.mouse.up();
  }
  await expect.poll(async () => (await added()).length).toBe(3);
  await area.evaluate(() => {
    window.fetch = window.__dropOriginalFetch;
    delete window.__dropOriginalFetch;
  });
  await page
    .locator("#conversation-drag-image")
    .evaluate((image) => image.remove());
  await ui
    .getByRole("status")
    .filter({ hasText: "正在导入图片" })
    .waitFor({ state: "hidden" });
  // Existing internal-resource dragging keeps its fixed version and adds no file.
  const snapshot = await readSnapshot();
  const asset = snapshot.assets.find((a) => a.id === nodes[0].data.assetId);
  await send([], { "application/studio-asset": asset.id });
  await expect.poll(async () => (await added()).length).toBe(4);
  await ui.getByText("已添加资源引用", { exact: true }).waitFor();
  assert.equal((await readSnapshot()).assets.length, snapshot.assets.length);
  await send([], { "text/uri-list": "file:///unreadable/image.png" });
  await ui
    .getByRole("alert")
    .filter({ hasText: "请将图片保存后拖入文件" })
    .waitFor();
  assert.equal((await added()).length, 4);
  const targetCanvas = (await readSnapshot()).canvases.find((canvas) =>
    canvas.nodes.some((node) => node.id === nodes[0].id),
  );
  await ui.getByRole("button", { name: /重新加载工作台/ }).click();
  await ui
    .locator(".project-card-open")
    .filter({ hasText: before.project.root })
    .click();
  await ui
    .getByRole("button")
    .filter({ hasText: targetCanvas.name })
    .first()
    .click();
  await ui.locator(".canvas-area").waitFor();
  nodes = await added();
  assert.equal(nodes.length, 4);
  await ui.locator(".react-flow__controls-fitview").click();
  for (const node of nodes) {
    const image = ui
      .locator(`.react-flow__node[data-id="${node.id}"] img`)
      .first();
    await expect
      .poll(() =>
        image.evaluate((image) => image.complete && image.naturalWidth > 0),
        {
          timeout: 15000,
          message: `restored image preview is decoded for node ${node.id}`,
        },
      )
      .toBe(true);
  }
  await page.screenshot({ path: `var/qa/${prefix}-canvas-drop.png` });
  console.log(
    `PASS ${prefix}: image file batches, ${ui === page ? "native thumbnail drag" : "HTML drop in opaque MCP receiver"}, zoomed drop position, immutable bytes, internal references, rejected URL and refresh persistence.`,
  );
}
