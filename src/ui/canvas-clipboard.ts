import type { Canvas, StudioNode, StudioEdge } from "../shared/types";

export interface CanvasClipboard {
  projectId: string;
  nodes: StudioNode[];
  edges: StudioEdge[];
}
// Keep node copies separate from the system clipboard used for Codex context.
// This also works in opaque-origin MCP workbenches without clipboard permission.
export let canvasClipboard: CanvasClipboard | undefined;
export function copyCanvasSelection(
  canvas: Canvas,
  ids: string[],
  projectId: string,
) {
  const nodes = canvas.nodes.filter((n) => ids.includes(n.id));
  if (
    !nodes.length ||
    nodes.some((n) => n.type === "workflow" || n.type === "generation")
  )
    throw new Error("制作分组需新建，以保留独立运行记录");
  const keys = new Set(nodes.map((n) => n.id));
  const value = structuredClone({
    projectId,
    nodes,
    edges: canvas.edges.filter((e) => keys.has(e.source) && keys.has(e.target)),
  });
  canvasClipboard = value;
  return value;
}
export function pasteCanvasSelection(
  value: CanvasClipboard,
  projectId: string,
  position: { x: number; y: number },
  newId: () => string,
) {
  if (value.projectId !== projectId)
    throw new Error("请在同一项目内粘贴资源引用");
  const x = Math.min(...value.nodes.map((n) => n.position.x));
  const y = Math.min(...value.nodes.map((n) => n.position.y));
  const ids = new Map(value.nodes.map((n) => [n.id, newId()]));
  const nodes = value.nodes.map((n) => ({
    ...structuredClone(n),
    id: ids.get(n.id)!,
    position: {
      x: Math.max(-100000, Math.min(100000, position.x + n.position.x - x)),
      y: Math.max(-100000, Math.min(100000, position.y + n.position.y - y)),
    },
  }));
  const edges = value.edges.map((e) => ({
    ...e,
    id: newId(),
    source: ids.get(e.source)!,
    target: ids.get(e.target)!,
  }));
  return {
    nodes,
    ops: [
      ...nodes.map((node) => ({ op: "add", node })),
      ...edges.map((edge) => ({ op: "connect", edge })),
    ],
  };
}
