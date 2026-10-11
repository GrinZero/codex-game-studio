import { readFileSync } from "node:fs";
import path from "node:path";
import { StudioCore } from "../src/server/core.js";
const core = new StudioCore();
try {
  const root = path.resolve("var/demo/star-maker");
  const existing = core.listProjects().find((p) => p.root === root);
  if (existing) {
    console.log(`示例项目已存在：${existing.id}`);
    process.exitCode = 0;
  } else {
    const p = core.projectManage({
      action: "create",
      name: "星铸者 · 示例",
      root,
      engine: "godot",
      collection: "创作实验",
    });
    const r = core.importFiles(
      p.id,
      [{ name: "reference.png", bytes: readFileSync("samples/reference.png") }],
      {
        name: "巡林者 · 造型探索",
        sourceRef: "工作台原创示例插画 · 非生产资产",
      },
    );
    const mood = core.importFiles(
      p.id,
      [{ name: "moodboard.png", bytes: readFileSync("samples/moodboard.png") }],
      { name: "森林遗迹 · 氛围参考", sourceRef: "工作台原创示例插画" },
    );
    const brief = core.importFiles(
      p.id,
      [{ name: "brief.md", bytes: readFileSync("samples/brief.md") }],
      { name: "巡林者 · 角色目标", sourceRef: "示例设计文档" },
    );
    const c = core.snapshot(p.id).canvases[0];
    core.canvasPatch({
      projectId: p.id,
      canvasId: c.id,
      target: "graph",
      expectedRevision: 0,
      ops: [
        {
          op: "add",
          node: {
            id: "n_reference",
            type: "asset",
            position: { x: 65, y: 70 },
            data: {
              title: "巡林者 · 造型探索",
              assetId: r.assetId,
              revisionId: r.id,
            },
          },
        },
        {
          op: "add",
          node: {
            id: "n_brief",
            type: "asset",
            position: { x: 65, y: 365 },
            data: {
              title: "巡林者 · 角色目标",
              assetId: brief.assetId,
              revisionId: brief.id,
            },
          },
        },
        {
          op: "add",
          node: {
            id: "n_note",
            type: "note",
            position: { x: 350, y: 75 },
            data: {
              title: "制作方向",
              text: "巡林者 / RANGER\n\n保留兜帽、短披风与灯笼。\n轮廓优先，材质保持克制。\n\n下一步：确认目标，再制作多视图。",
            },
          },
        },
        {
          op: "connect",
          edge: {
            id: "e_ref",
            source: "n_reference",
            target: "n_note",
            kind: "reference",
          },
        },
        {
          op: "instantiate",
          inputRevisionIds: [r.id],
          position: { x: 635, y: 75 },
        },
      ],
    });
    const c2 = core.canvasManage({
      projectId: p.id,
      action: "create",
      name: "场景规划",
    });
    core.canvasPatch({
      projectId: p.id,
      canvasId: c2.id,
      target: "graph",
      expectedRevision: 0,
      ops: [
        {
          op: "add",
          node: {
            id: "n_mood",
            type: "asset",
            position: { x: 80, y: 90 },
            data: {
              title: "森林遗迹 · 氛围参考",
              assetId: mood.assetId,
              revisionId: mood.id,
            },
          },
        },
        {
          op: "add",
          node: {
            id: "n_ranger_shared",
            type: "asset",
            position: { x: 370, y: 100 },
            data: {
              title: "巡林者 · 造型探索",
              assetId: r.assetId,
              revisionId: r.id,
            },
          },
        },
      ],
    });
    console.log(
      `已创建示例项目：${p.id}\n目录：${root}\n未执行生成、审核或引擎验收。`,
    );
  }
} finally {
  core.close();
}
