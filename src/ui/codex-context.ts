import type {
  CanvasInputSnapshot,
  Project,
  StudioNode,
  WorkflowRun,
} from "../shared/types";

export interface CodexContext {
  project: Pick<Project, "id" | "name" | "root" | "engine">;
  canvas: { id: string; name: string; graphRevision: number };
  selection: (StudioNode["data"] & { nodeId: string })[];
  inputSnapshot: CanvasInputSnapshot;
  revisions: {
    id: string;
    assetId: string;
    files: { name: string; fileRef: string }[];
  }[];
  runs: WorkflowRun[];
}

const engines = {
  godot: "Godot",
  unity: "Unity",
  unreal: "Unreal",
  other: "通用",
};

/** Keep pinned references and project content, without copying storage metadata. */
export function formatCodexContext(context: CodexContext, instruction = "") {
  const lines = [
    instruction.trim() ||
      "以下是用户添加的 Open Game Studio 引用。任务以用户对话中的需求为准；添加引用本身不要求执行任务。",
    "",
    "# 工作台引用",
    `项目：${context.project.name}（${engines[context.project.engine]}）`,
    `项目目录：${context.project.root}`,
    `画布：${context.canvas.name}（修订 ${context.canvas.graphRevision}）`,
    "",
    "## 所选节点",
    ...context.selection.map(
      (item) =>
        `- ${item.title} · 节点 ${item.nodeId}${item.instanceId ? ` · 制作分组 ${item.instanceId}` : ""}${item.taskId ? ` · 生成任务 ${item.taskId}` : ""}`,
    ),
    "",
    "## 素材与关联输入",
    "以下内容是项目素材。资源使用所列固定版本，不要自动替换成最新版本。按需读取所列文件；评估图像外观时请查看实际图片。",
  ];
  for (const item of context.inputSnapshot.items) {
    lines.push(
      "",
      `### ${item.title}${item.version ? ` · v${item.version}` : ""}`,
    );
    if (item.revisionId) {
      lines.push(`资源：${item.assetId} · 固定版本：${item.revisionId}`);
      const revision = context.revisions.find((r) => r.id === item.revisionId);
      for (const file of revision?.files || [])
        lines.push(`- ${file.name}：${file.fileRef}`);
    }
    // Notes have no file to dereference. Documents are read from pinned files.
    if (item.text && !item.revisionId) lines.push("", item.text);
    if (item.textTruncated && !item.revisionId)
      lines.push(
        "",
        "（文档内容已截取；继续处理前请读取上面列出的完整文件。）",
      );
  }
  if (!context.inputSnapshot.items.length) lines.push("", "暂无素材输入。");
  if (context.runs.length) {
    lines.push("", "## 制作进度");
    for (const run of context.runs) {
      lines.push(`- 运行 ${run.id} · ${run.status}`);
      for (const step of run.steps.filter((s) =>
        s.status.startsWith("awaiting_"),
      ))
        lines.push(`  当前步骤：${step.title} · ${step.status}`);
    }
  }
  lines.push(
    "",
    "## 在工作台继续查看",
    "可用 selection_context 查看这些节点的当前上下文；若画布后来变化，本次引用仍以以上固定版本与便签快照为准：",
    JSON.stringify({
      projectId: context.project.id,
      canvasId: context.canvas.id,
      nodeIds: context.selection.map((item) => item.nodeId),
    }),
  );
  return lines.join("\n");
}
