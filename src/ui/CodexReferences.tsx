import { useEffect, useState, useSyncExternalStore } from "react";
import { Link2, Loader2, X } from "lucide-react";
import { codexReferences, supportsCodexReferences } from "./api";

export function CodexReferenceBar() {
  const references = useSyncExternalStore(
    codexReferences.subscribe,
    codexReferences.getSnapshot,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    // A newly loaded view has no chips; clear the preceding view's host context.
    if (supportsCodexReferences())
      codexReferences
        .clear()
        .catch((error) =>
          setError(
            `无法重置对话引用：${error instanceof Error ? error.message : "请重试"}`,
          ),
        );
  }, []);
  async function remove(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (error) {
      setError(error instanceof Error ? error.message : "移除失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  if (!references.length && !error) return null;
  return (
    <aside className="codex-references" aria-label="当前对话引用">
      <div className="codex-references-heading">
        <span>
          <Link2 size={14} />
          当前对话引用
        </span>
        <button
          className="button small"
          disabled={busy}
          onClick={() => remove(() => codexReferences.clear())}
        >
          清空引用
        </button>
      </div>
      <div className="codex-reference-chips">
        {references.map(({ key, context }) => {
          const label =
            context.selection.length === 1
              ? context.selection[0].title
              : `${context.canvas.name} · ${context.selection.length} 项`;
          return (
            <div
              className="codex-reference-chip"
              key={key}
              title={`${context.project.name} / ${context.canvas.name}：${context.selection.map((item) => item.title).join("、")}`}
            >
              <Link2 size={12} />
              <span>{label}</span>
              <button
                className="icon-button"
                disabled={busy}
                aria-label={`移除引用 ${label}`}
                onClick={() => remove(() => codexReferences.remove(key))}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <p role="status">
        {busy ? (
          <>
            <Loader2 size={12} className="spin" />
            正在更新引用…
          </>
        ) : references.length ? (
          "已添加到对话上下文，可以直接描述需求。"
        ) : (
          "请重试同步引用状态。"
        )}
      </p>
      {error && (
        <p className="handoff-error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}
