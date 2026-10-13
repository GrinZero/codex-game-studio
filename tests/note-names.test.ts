import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { StudioCore } from "../src/server/core.js";

test("note names persist without changing text, connections or frozen inputs", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "studio-note-names-"));
  const registry = path.join(dir, "registry");
  const core = new StudioCore(registry);
  try {
    const project = core.projectManage({
      action: "create",
      name: "Notes",
      root: path.join(dir, "project"),
    });
    let canvas = core.snapshot(project.id).canvases[0];
    const patch = (ops: unknown[]) =>
      (canvas = core.canvasPatch({
        projectId: project.id,
        canvasId: canvas.id,
        target: "graph",
        expectedRevision: canvas.graphRevision,
        ops,
      }));
    patch([
      {
        op: "add",
        node: {
          id: "note",
          type: "note",
          position: { x: 10, y: 20 },
          data: { title: "Original", text: "Keep original text\n🔥" },
        },
      },
      {
        op: "instantiate",
        inputNodeIds: ["note"],
        position: { x: 300, y: 20 },
      },
    ]);
    const instance = canvas.instances[0];
    const plan = core.prepare({
      projectId: project.id,
      canvasId: canvas.id,
      instanceId: instance.id,
    });
    const run = core.start({
      projectId: project.id,
      planId: plan.id,
      expectedRevision: plan.graphRevision,
      idempotencyKey: "note-name-test",
    });
    const original = structuredClone(canvas);
    patch([{ op: "note", id: "note", title: "  Renamed 🔥  " }]);
    assert.deepEqual(canvas.nodes[0], {
      ...original.nodes[0],
      data: { ...original.nodes[0].data, title: "Renamed 🔥" },
    });
    assert.deepEqual(canvas.edges, original.edges);
    assert.deepEqual(canvas.instances, original.instances);
    assert.equal(canvas.layoutRevision, original.layoutRevision);
    assert.equal(canvas.graphRevision, original.graphRevision + 1);
    const reopened = new StudioCore(registry);
    try {
      const saved = reopened.snapshot(project.id);
      assert.equal(saved.canvases[0].nodes[0].data.title, "Renamed 🔥");
      assert.deepEqual(
        saved.runs.find((r) => r.id === run.id)?.inputSnapshot,
        run.inputSnapshot,
      );
      assert.equal(saved.runs[0].inputSnapshot?.items[0].title, "Original");
    } finally {
      reopened.close();
    }
    for (const op of [
      { title: " " },
      { title: "x".repeat(121) },
      { title: null },
      {},
    ]) {
      assert.throws(() => patch([{ op: "note", id: "note", ...op }]));
      assert.deepEqual(core.snapshot(project.id).canvases[0], canvas);
    }
    assert.throws(() =>
      core.canvasPatch({
        projectId: project.id,
        canvasId: canvas.id,
        target: "graph",
        expectedRevision: original.graphRevision,
        ops: [{ op: "note", id: "note", title: "Stale" }],
      }),
    );
    patch([{ op: "note", id: "note", text: "Legacy text update" }]);
    assert.equal(canvas.nodes[0].data.title, "Renamed 🔥");
    patch([{ op: "note", id: "note", title: "Final", text: "Final text" }]);
    assert.deepEqual(canvas.nodes[0].data, {
      title: "Final",
      text: "Final text",
    });
  } finally {
    core.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
