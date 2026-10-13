import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptsCanvasDrop,
  captureCanvasImageDrop,
  resolveCanvasImages,
} from "../src/ui/canvas-drop.js";

test("recognizes native files, image HTML and internal references during protected dragover", () => {
  for (const type of [
    "Files",
    "text/html",
    "text/uri-list",
    "application/studio-asset",
  ])
    assert.equal(acceptsCanvasDrop({ types: [type] }), true);
  assert.equal(acceptsCanvasDrop({ types: ["application/unknown"] }), false);
});
test("captures the event data before the drag store is cleared and prefers actual files", async () => {
  const file = new File(["bytes"], "参考.png", { type: "image/png" });
  const transfer = {
    files: [file],
    items: [],
    getData: () => "<img src='unreadable'>",
  } as unknown as DataTransfer;
  const drop = captureCanvasImageDrop(transfer);
  (transfer.files as unknown as File[]).length = 0;
  assert.deepEqual(await resolveCanvasImages(drop), [file]);
});
test("falls back to native file items and rejects unsupported or excessive batches before import", async () => {
  const file = new File(["bytes"], "参考.jpg", { type: "image/jpeg" });
  const drop = captureCanvasImageDrop({
    files: [],
    items: [{ kind: "file", getAsFile: () => file }],
    getData: () => "",
  } as unknown as DataTransfer);
  assert.deepEqual(await resolveCanvasImages(drop), [file]);
  await assert.rejects(
    resolveCanvasImages({ ...drop, files: Array(13).fill(file) }),
    /12/,
  );
  await assert.rejects(
    resolveCanvasImages({
      ...drop,
      files: [file, new File(["text"], "note.txt")],
    }),
    /PNG/,
  );
  await assert.rejects(
    resolveCanvasImages({ ...drop, files: [new File([], "empty.png")] }),
    /空图片/,
  );
});
