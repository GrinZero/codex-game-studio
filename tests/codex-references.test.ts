import assert from "node:assert/strict";
import { test } from "node:test";
import { CodexReferenceStore } from "../src/ui/codex-references";
import { formatCodexContext, type CodexContext } from "../src/ui/codex-context";

function context(nodeId = "node-a"): CodexContext {
  return {
    project: {
      id: "project-a",
      name: "角色项目",
      root: "/tmp/game",
      engine: "godot",
    },
    canvas: { id: "canvas-a", name: "角色探索", graphRevision: 3 },
    selection: [
      {
        nodeId,
        title: "角色参考",
        assetId: "asset-a",
        revisionId: "rev-pinned",
      },
    ],
    inputSnapshot: {
      graphRevision: 3,
      targetNodeIds: [nodeId],
      revisionIds: ["rev-pinned"],
      prompt: "",
      items: [
        {
          nodeId,
          type: "asset",
          role: "reference",
          title: "角色参考",
          assetId: "asset-a",
          revisionId: "rev-pinned",
          version: 1,
          text: "文档正文按需读取",
        },
        {
          nodeId: "note",
          type: "note",
          role: "prompt",
          title: "设计便签",
          text: "保持蓝色衣服",
        },
      ],
    },
    revisions: [
      {
        id: "rev-pinned",
        assetId: "asset-a",
        files: [{ name: "design.md", fileRef: "/tmp/game/design-v1.md" }],
      },
    ],
    runs: [],
  };
}

test("references retain pinned paths and note snapshots without copying document bodies", () => {
  const text = formatCodexContext(context());
  assert.ok(text.includes("rev-pinned"));
  assert.ok(text.includes("/tmp/game/design-v1.md"));
  assert.ok(text.includes("保持蓝色衣服"));
  assert.ok(!text.includes("文档正文按需读取"));
  assert.ok(text.includes("添加引用本身不要求执行任务"));
});

test("concurrent additions accumulate, freeze inputs and refresh duplicate selections", async () => {
  const sent: string[] = [];
  const store = new CodexReferenceStore(async (text) => {
    sent.push(text);
  });
  const first = context();
  const adding = store.add(first);
  first.selection[0].title = "changed after click";
  await Promise.all([adding, store.add(context("node-b"))]);
  assert.equal(store.getSnapshot().length, 2);
  assert.equal(store.getSnapshot()[0].context.selection[0].title, "角色参考");
  assert.ok(sent.at(-1)!.includes("node-a") && sent.at(-1)!.includes("node-b"));
  const updated = context();
  updated.canvas.graphRevision = 4;
  await store.add(updated);
  assert.equal(store.getSnapshot().length, 2);
  assert.equal(
    store
      .getSnapshot()
      .find((item) => item.context.selection[0].nodeId === "node-a")!.context
      .canvas.graphRevision,
    4,
  );
});

test("host rejection preserves references; later removals recover and clear host context", async () => {
  let reject = false;
  let sent = "";
  const store = new CodexReferenceStore(async (text) => {
    if (reject) throw new Error("host rejected");
    sent = text;
  });
  await store.add(context());
  const snapshot = store.getSnapshot();
  reject = true;
  await assert.rejects(store.remove(snapshot[0].key), /host rejected/);
  assert.equal(store.getSnapshot(), snapshot);
  await assert.rejects(store.add(context("node-b")), /host rejected/);
  assert.equal(store.getSnapshot(), snapshot);
  reject = false;
  await store.remove(snapshot[0].key);
  assert.equal(store.getSnapshot().length, 0);
  assert.ok(sent.includes("用户已移除全部工作台引用"));
});
