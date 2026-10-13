import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { StudioCore } from "../src/server/core.js";
import {
  copyCanvasSelection,
  pasteCanvasSelection,
} from "../src/ui/canvas-clipboard.js";

test("node dimensions persist as layout with CAS, reset, duplication and atomic validation", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "studio-sizing-"));
  const registry = path.join(dir, "registry");
  const core = new StudioCore(registry);
  try {
    const project = core.projectManage({
      action: "create",
      name: "Sizing",
      root: path.join(dir, "project"),
    });
    let canvas = core.snapshot(project.id).canvases[0];
    const patch = (
      target: "graph" | "layout",
      ops: unknown[],
      revision?: number,
    ) =>
      (canvas = core.canvasPatch({
        projectId: project.id,
        canvasId: canvas.id,
        target,
        expectedRevision:
          revision ??
          (target === "graph" ? canvas.graphRevision : canvas.layoutRevision),
        ops,
      }));
    patch("graph", [
      {
        op: "add",
        node: {
          id: "note",
          type: "note",
          position: { x: 10, y: 20 },
          data: { title: "Note", text: "Input" },
        },
      },
      {
        op: "instantiate",
        inputNodeIds: ["note"],
        position: { x: 300, y: 20 },
      },
    ]);
    const graph = canvas.graphRevision;
    const plan = core.prepare({
      projectId: project.id,
      canvasId: canvas.id,
      instanceId: canvas.instances[0].id,
    });
    const original = structuredClone(canvas);
    patch("layout", [
      { op: "resize", id: "note", width: 480, height: 320 },
      { op: "move", id: "note", position: { x: -40, y: -50 } },
      { op: "resize", id: canvas.nodes[1].id, width: 600, height: 500 },
    ]);
    assert.equal(canvas.graphRevision, graph);
    assert.deepEqual(canvas.edges, original.edges);
    assert.deepEqual(canvas.nodes[0].data, original.nodes[0].data);
    assert.equal(canvas.layoutRevision, original.layoutRevision + 1);
    assert.equal(canvas.nodes[0].width, 480);
    assert.equal(canvas.nodes[0].height, 320);
    assert.doesNotThrow(() =>
      core.start({
        projectId: project.id,
        planId: plan.id,
        expectedRevision: plan.graphRevision,
        idempotencyKey: "sized-plan",
      }),
    );
    assert.throws(() =>
      patch(
        "layout",
        [{ op: "resize", id: "note", width: 500, height: 400 }],
        original.layoutRevision,
      ),
    );
    for (const size of [
      { width: 159, height: 320 },
      { width: 480, height: 119 },
      { width: 4001, height: 320 },
      { width: 480, height: Infinity },
      { width: null, height: 320 },
      { width: 480 },
      { width: NaN, height: 320 },
    ]) {
      assert.throws(() =>
        patch("layout", [
          { op: "move", id: "note", position: { x: 999, y: 999 } },
          { op: "resize", id: "note", ...size },
        ]),
      );
      assert.deepEqual(core.snapshot(project.id).canvases[0], canvas);
    }
    assert.throws(() =>
      patch("layout", [
        { op: "resize", id: "missing", width: 480, height: 320 },
      ]),
    );
    let sequence = 0;
    const pasted = pasteCanvasSelection(
      copyCanvasSelection(canvas, ["note"], project.id),
      project.id,
      { x: 800, y: 200 },
      () => `copy_${++sequence}`,
    );
    patch("graph", pasted.ops);
    assert.equal(canvas.nodes.at(-1)?.width, 480);
    assert.equal(canvas.nodes.at(-1)?.height, 320);
    const copy = core.canvasManage({
      projectId: project.id,
      action: "duplicate",
      canvasId: canvas.id,
    });
    assert.equal(copy.nodes[0].width, 480);
    const reopened = new StudioCore(registry);
    try {
      assert.deepEqual(
        reopened.snapshot(project.id).canvases.find((c) => c.id === canvas.id),
        canvas,
      );
    } finally {
      reopened.close();
    }
    patch("layout", [{ op: "resize", id: "note", width: null, height: null }]);
    assert.equal(canvas.nodes[0].width, undefined);
    assert.equal(canvas.nodes[0].height, undefined);
    assert.deepEqual(canvas.nodes[0].position, { x: -40, y: -50 });
  } finally {
    core.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
