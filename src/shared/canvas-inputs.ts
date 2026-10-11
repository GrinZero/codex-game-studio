import type {
  Asset,
  AssetRevision,
  Canvas,
  CanvasInputSnapshot,
} from "./types.js";

/** Directed references are inputs. Visit upstream first and keep pinned versions. */
export function resolveCanvasInputs(
  canvas: Canvas,
  targetNodeIds: string[],
  assets: Asset[],
): CanvasInputSnapshot {
  const result: CanvasInputSnapshot = {
    graphRevision: canvas.graphRevision,
    targetNodeIds: [...targetNodeIds],
    revisionIds: [],
    items: [],
    prompt: "",
  };
  const nodes = new Map(canvas.nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, string[]>();
  for (const edge of canvas.edges) {
    const list = incoming.get(edge.target) || [];
    list.push(edge.source);
    incoming.set(edge.target, list);
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const revisions = new Map<
    string,
    { asset: Asset; revision: AssetRevision }
  >();
  for (const asset of assets)
    for (const revision of asset.revisions)
      revisions.set(revision.id, { asset, revision });

  function addRevision(
    id: string,
    nodeId?: string,
    title?: string,
    assetId?: string,
  ) {
    const entry = revisions.get(id);
    if (!entry || (assetId && entry.asset.id !== assetId))
      throw new Error("输入资产版本不存在或与节点不匹配，请检查连线");
    if (result.revisionIds.includes(id)) return;
    const { asset, revision } = entry;
    result.revisionIds.push(id);
    result.items.push({
      ...(nodeId ? { nodeId } : {}),
      title: title || asset.name,
      type: "asset",
      role: asset.kind === "document" ? "prompt" : "reference",
      assetId: asset.id,
      revisionId: id,
      version: revision.number,
      kind: asset.kind,
      files: structuredClone(revision.files),
    });
  }

  function visit(id: string, root = false) {
    if (visiting.has(id)) throw new Error("输入连线存在循环，请断开循环后重试");
    if (visited.has(id)) return;
    const node = nodes.get(id);
    if (!node) throw new Error("输入连线指向不存在的节点");
    if (node.type === "generation")
      throw new Error("请等待生成完成后再引用产物");
    if (node.type === "workflow" && !root)
      throw new Error("制作分组不能作为输入，请连接明确的产出资产版本");
    visiting.add(id);
    for (const source of incoming.get(id) || []) visit(source);
    if (node.type === "asset") {
      if (!node.data.revisionId) throw new Error("输入节点没有固定资产版本");
      addRevision(node.data.revisionId, id, node.data.title, node.data.assetId);
    } else if (node.type === "note") {
      result.items.push({
        nodeId: id,
        title: node.data.title,
        type: "note",
        role: "prompt",
        text: node.data.text || "",
      });
    } else {
      const instance = canvas.instances.find(
        (i) => i.id === node.data.instanceId,
      );
      if (!instance) throw new Error("制作分组不存在");
      // Legacy and API-only inputs without a canvas node remain explicit inputs.
      for (const revisionId of instance.inputRevisionIds)
        addRevision(revisionId);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of targetNodeIds) visit(id, true);
  if (result.items.length > 40)
    throw new Error("制作输入最多支持 40 项，请减少上游引用");
  if (result.revisionIds.length > 20)
    throw new Error("制作输入最多支持 20 个资产版本");
  result.prompt = canvasInputPrompt(result.items);
  return result;
}

export function canvasInputPrompt(items: CanvasInputSnapshot["items"]) {
  return items
    .filter((i) => i.role === "prompt" && i.text?.trim())
    .map(
      (i) => `## ${i.title}${i.version ? ` · v${i.version}` : ""}\n${i.text}`,
    )
    .join("\n\n");
}

export function canvasConnectionError(
  canvas: Canvas,
  source: string,
  target: string,
): string | undefined {
  const from = canvas.nodes.find((n) => n.id === source);
  if (!from || !canvas.nodes.some((n) => n.id === target) || source === target)
    return "输入关系的端点无效";
  if (from.type === "generation") return "请等待生成完成后再引用产物";
  if (from.type === "workflow")
    return "请连接制作产出的资产版本，不能直接连接制作分组的输出";
  if (canvas.edges.some((e) => e.source === source && e.target === target))
    return "这两个节点已经连接";
  const seen = new Set<string>();
  const pending = [target];
  while (pending.length) {
    const id = pending.pop()!;
    if (id === source) return "连线不能形成循环输入";
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of canvas.edges) if (e.source === id) pending.push(e.target);
  }
}
