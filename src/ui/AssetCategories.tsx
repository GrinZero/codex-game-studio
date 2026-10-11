import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import type { Asset } from "../shared/types";
import {
  assetCategories,
  assetCategory,
  assetCategoryTags,
  explicitAssetCategory,
  inferAssetCategory,
  type AssetCategory,
} from "../shared/asset-categories";

export function AssetGroups({
  assets,
  projectId,
  searching,
  renderAsset,
}: {
  assets: Asset[];
  projectId: string;
  searching: boolean;
  renderAsset: (asset: Asset) => ReactNode;
}) {
  const storageKey = `studio:asset-groups:${projectId}`;
  const [expanded, setExpanded] = useState<AssetCategory[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(saved)
        ? assetCategories.filter((c) => saved.includes(c))
        : [];
    } catch {
      return [];
    }
  });
  const groups = assetCategories
    .map((category) => ({
      category,
      assets: assets.filter((asset) => assetCategory(asset) === category),
    }))
    .filter((group) => group.assets.length);
  const allExpanded = groups.every((group) =>
    expanded.includes(group.category),
  );
  function update(next: AssetCategory[]) {
    setExpanded(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  }
  return (
    <>
      {!!groups.length && (
        <div className="dock-group-toolbar">
          <span>按用途分类</span>
          {!searching && (
            <button
              onClick={() =>
                update(allExpanded ? [] : groups.map((group) => group.category))
              }
            >
              {allExpanded ? "收起全部" : "展开全部"}
            </button>
          )}
        </div>
      )}
      <div className="dock-assets">
        {groups.map((group) => {
          const open = searching || expanded.includes(group.category);
          const id = `asset-group-${projectId}-${assetCategories.indexOf(group.category)}`;
          return (
            <section className="dock-group" key={group.category}>
              <button
                className="dock-group-title"
                aria-expanded={open}
                aria-controls={id}
                aria-label={`${group.category}，${group.assets.length} 个资源`}
                onClick={() => {
                  if (searching) return;
                  update(
                    open
                      ? expanded.filter((c) => c !== group.category)
                      : [...expanded, group.category],
                  );
                }}
              >
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <Folder size={14} />
                <strong>{group.category}</strong>
                <span>{group.assets.length}</span>
              </button>
              <div id={id} className="dock-group-items" hidden={!open}>
                {open && group.assets.map(renderAsset)}
              </div>
            </section>
          );
        })}
        {!assets.length && (
          <p className="dock-empty">
            {searching
              ? "没有匹配的资源，试试其他名称或分类。"
              : "暂无可用资源，点击下方导入。"}
          </p>
        )}
      </div>
    </>
  );
}

export function AssetCategoryEditor({
  asset,
  projectId,
  mutate,
  notify,
}: {
  asset: Asset;
  projectId: string;
  mutate: (name: string, args: unknown) => Promise<any>;
  notify: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="asset-category-editor">
      <span>用途分类</span>
      <select
        aria-label="用途分类"
        value={explicitAssetCategory(asset) ?? "auto"}
        disabled={busy}
        onChange={async (event) => {
          const category =
            event.target.value === "auto"
              ? undefined
              : (event.target.value as AssetCategory);
          setBusy(true);
          try {
            const result = await mutate("asset_manage", {
              projectId,
              assetId: asset.id,
              expectedRevision: asset.revision,
              tags: assetCategoryTags(asset, category),
            });
            if (result)
              notify(category ? `已归入${category}` : "已恢复自动分类");
          } catch (error) {
            notify(error instanceof Error ? error.message : "分类保存失败");
          } finally {
            setBusy(false);
          }
        }}
      >
        <option value="auto">自动 · {inferAssetCategory(asset)}</option>
        {assetCategories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
    </label>
  );
}
