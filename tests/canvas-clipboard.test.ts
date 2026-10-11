import { test } from "node:test";
import assert from "node:assert/strict";
import {
  copyCanvasSelection,
  pasteCanvasSelection,
} from "../src/ui/canvas-clipboard";
import type { Canvas } from "../src/shared/types";
const canvas = {
  nodes: [
    {
      id: "note",
      type: "note",
      position: { x: 10, y: 20 },
      data: { title: "约束", text: "保持兜帽" },
    },
    {
      id: "image",
      type: "asset",
      position: { x: 300, y: 50 },
      data: { title: "参考", assetId: "asset", revisionId: "fixed-v1" },
    },
    {
      id: "external",
      type: "note",
      position: { x: 0, y: 0 },
      data: { title: "外部", text: "外部约束" },
    },
    {
      id: "flow",
      type: "workflow",
      position: { x: 500, y: 20 },
      data: { title: "制作", instanceId: "instance" },
    },
  ],
  edges: [
    { id: "internal", source: "note", target: "image", kind: "reference" },
    {
      id: "external-edge",
      source: "external",
      target: "image",
      kind: "reference",
    },
  ],
} as Canvas;
test("复制与粘贴保留固定版本、相对位置和内部输入连线", () => {
  const value = copyCanvasSelection(canvas, ["note", "image"], "project");
  let sequence = 0;
  const result = pasteCanvasSelection(
    value,
    "project",
    { x: 100, y: 200 },
    () => `new-${++sequence}`,
  );
  assert.equal(result.nodes[1].data.revisionId, "fixed-v1");
  assert.deepEqual(
    result.nodes.map((n) => n.position),
    [
      { x: 100, y: 200 },
      { x: 390, y: 230 },
    ],
  );
  assert.equal(result.ops.length, 3);
  assert.deepEqual(result.ops[2], {
    op: "connect",
    edge: { id: "new-3", source: "new-1", target: "new-2", kind: "reference" },
  });
  result.nodes[0].data.text = "修改副本";
  assert.equal(canvas.nodes[0].data.text, "保持兜帽");
  assert.equal(value.nodes[0].data.text, "保持兜帽");
});
test("制作分组与跨项目引用不能直接复制粘贴", () => {
  assert.throws(
    () => copyCanvasSelection(canvas, ["flow"], "project"),
    /运行记录/,
  );
  const value = copyCanvasSelection(canvas, ["image"], "project");
  assert.throws(
    () => pasteCanvasSelection(value, "another", { x: 0, y: 0 }, () => "id"),
    /同一项目/,
  );
});
