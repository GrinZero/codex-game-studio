import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { StudioCore } from "../src/server/core.js";
import { dispatch } from "../src/server/operations.js";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM2cAAAAASUVORK5CYII=",
  "base64",
);
function setup() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "studio-resources-"));
  const core = new StudioCore(path.join(dir, "registry"));
  const p = core.projectManage({
    action: "create",
    name: "resources",
    root: path.join(dir, "game"),
  });
  const c = core.snapshot(p.id).canvases[0];
  return {
    dir,
    core,
    p,
    c,
    clean() {
      core.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
function task(
  x: ReturnType<typeof setup>,
  key: string,
  prompt = "生成游戏道具",
) {
  return x.core.generationCreate({
    projectId: x.p.id,
    canvasId: x.c.id,
    expectedRevision: x.core.snapshot(x.p.id).canvases[0].graphRevision,
    kind: "image",
    name: "道具",
    prompt,
    inputNodeIds: [],
    position: { x: 300, y: 0 },
    idempotencyKey: key,
  });
}
test("文档保存为新版本，其他画布保留旧引用；冲突不会写入版本或节点", () => {
  const x = setup();
  try {
    const a = {
      projectId: x.p.id,
      canvasId: x.c.id,
      expectedRevision: 0,
      nodeId: "doc",
      name: "设计",
      text: "# 旧版",
    };
    const r1 = x.core.documentSave(a);
    const copy = x.core.canvasManage({
      projectId: x.p.id,
      action: "duplicate",
      canvasId: x.c.id,
    });
    const r2 = x.core.documentSave({
      ...a,
      expectedRevision: 1,
      assetId: r1.assetId,
      expectedLatestRevisionId: r1.id,
      text: "# 新版\n\n- 道具",
    });
    const s = x.core.snapshot(x.p.id);
    assert.equal(
      s.canvases.find((c) => c.id === x.c.id)!.nodes[0].data.revisionId,
      r2.id,
    );
    assert.equal(
      s.canvases.find((c) => c.id === copy.id)!.nodes[0].data.revisionId,
      r1.id,
    );
    assert.equal(
      readFileSync(x.core.assetFile(x.p.id, r1.id, 0).file, "utf8"),
      "# 旧版",
    );
    assert.throws(
      () =>
        x.core.documentSave({
          ...a,
          assetId: r1.assetId,
          expectedLatestRevisionId: r1.id,
          expectedRevision: 2,
          text: "覆盖",
        }),
      /已有新版本/,
    );
    assert.throws(
      () =>
        x.core.documentSave({
          ...a,
          nodeId: "other",
          expectedRevision: 0,
          text: "冲突",
        }),
      /版本冲突/,
    );
    assert.equal(x.core.snapshot(x.p.id).assets.length, 1);
    assert.equal(x.core.snapshot(x.p.id).assets[0].revisions.length, 2);
  } finally {
    x.clean();
  }
});
test("任务幂等、冻结输入、完成原子回填、重启保留，并拒绝重复提交", () => {
  const x = setup();
  try {
    const r = x.core.importFiles(x.p.id, [{ name: "ref.png", bytes: png }]);
    x.core.canvasPatch({
      projectId: x.p.id,
      canvasId: x.c.id,
      target: "graph",
      expectedRevision: 0,
      ops: [
        {
          op: "add",
          node: {
            id: "ref",
            type: "asset",
            position: { x: 0, y: 0 },
            data: { title: "参考", assetId: r.assetId, revisionId: r.id },
          },
        },
        {
          op: "add",
          node: {
            id: "text",
            type: "note",
            position: { x: 0, y: 300 },
            data: { title: "要求", text: "原始描述" },
          },
        },
      ],
    });
    const a = {
      projectId: x.p.id,
      canvasId: x.c.id,
      expectedRevision: 1,
      kind: "image",
      name: "结果",
      prompt: "制作图标",
      inputNodeIds: ["ref", "text"],
      position: { x: 300, y: 0 },
      idempotencyKey: "one",
    };
    const t = x.core.generationCreate(a);
    assert.equal(x.core.generationCreate(a).id, t.id);
    assert.throws(
      () => x.core.generationCreate({ ...a, prompt: "变更" }),
      /幂等键/,
    );
    x.core.canvasPatch({
      projectId: x.p.id,
      canvasId: x.c.id,
      target: "graph",
      expectedRevision: 2,
      ops: [{ op: "note", id: "text", text: "变更描述" }],
    });
    assert.equal(
      x.core
        .generationGet(x.p.id, t.id)
        .task.inputSnapshot.items.find((i) => i.nodeId === "text")!.text,
      "原始描述",
    );
    const run = x.core.generationUpdate(
      x.p.id,
      t.id,
      0,
      { status: "running" },
      ["draft"],
    );
    writeFileSync(path.join(x.p.root, "out.png"), png);
    writeFileSync(path.join(x.p.root, "wrong.md"), "not image");
    assert.throws(
      () =>
        x.core.generationComplete(x.p.id, t.id, run.revision, ["wrong.md"], ""),
      /类型/,
    );
    const done = x.core.generationComplete(
      x.p.id,
      t.id,
      run.revision,
      ["out.png"],
      "制作完成",
    );
    assert.equal(done.status, "succeeded");
    const c = x.core.snapshot(x.p.id).canvases[0];
    assert.equal(c.nodes.find((n) => n.id === t.nodeId)!.type, "asset");
    assert.equal(c.edges.filter((e) => e.target === t.nodeId).length, 2);
    assert.throws(
      () =>
        x.core.generationComplete(x.p.id, t.id, done.revision, ["out.png"], ""),
      /未在执行/,
    );
    const second = new StudioCore(path.join(x.dir, "registry"));
    try {
      assert.equal(
        second.generationGet(x.p.id, t.id).task.outputRevisionId,
        done.outputRevisionId,
      );
    } finally {
      second.close();
    }
  } finally {
    x.clean();
  }
});
test("草稿可采用真实产物，未完成任务不能作为引用或复制到其他画布", () => {
  const x = setup();
  try {
    const t = task(x, "adopt");
    assert.throws(
      () =>
        x.core.generationCreate({
          projectId: x.p.id,
          canvasId: x.c.id,
          expectedRevision: 1,
          kind: "image",
          name: "next",
          prompt: "next",
          inputNodeIds: [t.nodeId],
          position: { x: 600, y: 0 },
          idempotencyKey: "next",
        }),
      /等待生成/,
    );
    assert.throws(
      () =>
        x.core.generationCreate({
          projectId: x.p.id,
          canvasId: x.c.id,
          expectedRevision: 1,
          kind: "animation",
          name: "动作",
          prompt: "walk",
          inputNodeIds: [],
          position: { x: 600, y: 0 },
          idempotencyKey: "animation",
        }),
      /3D 模型/,
    );
    const copy = x.core.canvasManage({
      projectId: x.p.id,
      action: "duplicate",
      canvasId: x.c.id,
    });
    assert.equal(copy.nodes.length, 0);
    const r = x.core.importFiles(x.p.id, [{ name: "out.png", bytes: png }]);
    const result = dispatch(x.core, "generation_adopt", {
      projectId: x.p.id,
      taskId: t.id,
      expectedRevision: t.revision,
      revisionId: r.id,
    }) as any;
    assert.equal(result.outputRevisionId, r.id);
    assert.equal(x.core.snapshot(x.p.id).assets.length, 1);
  } finally {
    x.clean();
  }
});
test("本地 worker 真正执行、自动入库，重复启动只执行一次；使用隔离测试执行器", async () => {
  const x = setup();
  const prior = process.env.STUDIO_CODEX_BIN;
  try {
    const fake = path.join(x.dir, "codex");
    writeFileSync(
      fake,
      `#!${process.execPath}\nconst fs=require('fs'),path=require('path');let prompt='';process.stdin.on('data',d=>prompt+=d);process.stdin.on('end',()=>{const output=process.argv[process.argv.indexOf('--output-last-message')+1];const file=path.join(path.dirname(output),'output.png');fs.writeFileSync(file,Buffer.from('${png.toString("base64")}','base64'));fs.writeFileSync(output,JSON.stringify({fileRefs:[file],summary:'测试执行器'}));});\n`,
      { mode: 0o755 },
    );
    process.env.STUDIO_CODEX_BIN = fake;
    const t = task(x, "worker");
    const running = dispatch(x.core, "generation_start", {
      projectId: x.p.id,
      taskId: t.id,
      expectedRevision: 0,
    }) as any;
    assert.equal(running.status, "running");
    const repeated = dispatch(x.core, "generation_start", {
      projectId: x.p.id,
      taskId: t.id,
      expectedRevision: 0,
    }) as any;
    assert.equal(repeated.workerPid, running.workerPid);
    for (let i = 0; i < 60; i++) {
      const status = x.core.generationGet(x.p.id, t.id).task.status;
      if (status !== "running") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(x.core.generationGet(x.p.id, t.id).task.status, "succeeded");
    assert.equal(x.core.snapshot(x.p.id).assets.length, 1);
  } finally {
    if (prior === undefined) delete process.env.STUDIO_CODEX_BIN;
    else process.env.STUDIO_CODEX_BIN = prior;
    x.clean();
  }
});

test("已有项目按需迁移任务表，保留项目与资源", () => {
  const x = setup();
  try {
    const r = x.core.importFiles(x.p.id, [{ name: "keep.png", bytes: png }]);
    x.core.inProject(x.p.id, (db) => db.exec("DROP TABLE tasks"));
    const s = x.core.snapshot(x.p.id);
    assert.equal(s.assets[0].latestRevisionId, r.id);
    assert.equal(s.canvases[0].id, x.c.id);
    assert.deepEqual(s.tasks, []);
  } finally {
    x.clean();
  }
});

test("重启恢复已写入结果，中断任务不重新生成", async () => {
  const x = setup();
  try {
    const { mkdirSync } = await import("node:fs");
    const { reconcileGenerations } = await import(
      "../src/server/generation.js"
    );
    const t = task(x, "recover");
    x.core.generationUpdate(
      x.p.id,
      t.id,
      0,
      { status: "running", workerPid: 2147483647 },
      ["draft"],
    );
    const dir = path.join(x.p.root, ".game-studio", "generated", t.id);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "recovered.png");
    writeFileSync(file, png);
    writeFileSync(
      path.join(dir, "result.json"),
      JSON.stringify({ fileRefs: [file], summary: "服务退出后保留的结果" }),
    );
    reconcileGenerations(x.core);
    assert.equal(x.core.generationGet(x.p.id, t.id).task.status, "succeeded");
    const interrupted = task(x, "interrupted");
    x.core.generationUpdate(
      x.p.id,
      interrupted.id,
      0,
      { status: "running", workerPid: 2147483647 },
      ["draft"],
    );
    reconcileGenerations(x.core);
    assert.equal(
      x.core.generationGet(x.p.id, interrupted.id).task.status,
      "interrupted",
    );
    assert.throws(
      () =>
        dispatch(x.core, "generation_start", {
          projectId: x.p.id,
          taskId: interrupted.id,
          expectedRevision: 2,
        }),
      /状态/,
    );
    assert.equal(x.core.snapshot(x.p.id).assets.length, 1);
  } finally {
    x.clean();
  }
});
