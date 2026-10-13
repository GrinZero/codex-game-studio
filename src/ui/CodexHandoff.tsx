import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  FileText,
  Link2,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import {
  call,
  codexReferences,
  isEmbeddedApp,
  supportsCodexReferences,
} from "./api";
import { formatCodexContext, type CodexContext } from "./codex-context";

export function CodexHandoff({
  projectId,
  canvasId,
  nodeIds,
  onClose,
  notify,
}: {
  projectId: string;
  canvasId: string;
  nodeIds: string[];
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = useRef<HTMLTextAreaElement>(null);
  const [context, setContext] = useState<CodexContext>();
  const [error, setError] = useState("");
  const [clipboardError, setClipboardError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const direct = supportsCodexReferences();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    setContext(undefined);
    setError("");
    setCopied(false);
    setClipboardError(false);
    call<CodexContext>("selection_context", { projectId, canvasId, nodeIds })
      .then((value) => {
        if (active) setContext(value);
      })
      .catch((error) => {
        if (active)
          setError(
            error instanceof Error ? error.message : "无法读取引用，请重试。",
          );
      });
    return () => {
      active = false;
    };
  }, [projectId, canvasId, nodeIds, attempt]);
  const text = context ? formatCodexContext(context) : "";
  const upstream =
    context?.inputSnapshot.items.filter(
      (item) => !item.nodeId || !nodeIds.includes(item.nodeId),
    ).length || 0;
  async function add() {
    if (!context || busy) return;
    setBusy(true);
    setError("");
    try {
      await codexReferences.add(context);
      notify("已添加对话引用，可以直接向 Codex 描述需求");
      onClose();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "添加引用失败，请重试。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!text || busy) return;
    setBusy(true);
    setClipboardError(false);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      notify("已复制引用，粘贴到 Codex 对话即可");
    } catch {
      setExpanded(true);
      setClipboardError(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (clipboardError && expanded) {
      preview.current?.focus();
      preview.current?.select();
    }
  }, [clipboardError, expanded]);
  return (
    <dialog
      ref={dialog}
      className="codex-handoff"
      aria-label="添加对话引用"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>添加对话引用</h2>
        <button
          className="icon-button"
          aria-label="关闭"
          disabled={busy}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <div className="handoff-body">
        <p className="handoff-description">
          引用所选素材后，可以直接在对话里说你想做什么。引用保留素材版本与关联输入。
        </p>
        {!direct && (
          <p className="handoff-description" role="status">
            {isEmbeddedApp()
              ? "当前宿主暂不支持直接添加引用。可复制引用后粘贴到 Codex 对话。"
              : "浏览器工作台无法直接连接当前对话。请在 Codex 内打开工作台添加引用，或复制引用后粘贴。"}
          </p>
        )}
        {!context && !error && (
          <div className="handoff-loading" role="status">
            <Loader2 size={16} className="spin" />
            正在读取所选引用…
          </div>
        )}
        {error && (
          <div className="handoff-error" role="alert">
            <p>{error}</p>
            {!context && (
              <button
                className="button small"
                onClick={() => setAttempt((n) => n + 1)}
              >
                <RefreshCw size={13} />
                重新读取
              </button>
            )}
          </div>
        )}
        {context && (
          <>
            <div className="handoff-context">
              <div className="handoff-context-heading">
                <span>
                  {context.project.name} / {context.canvas.name}
                </span>
                <small>
                  已选 {context.selection.length} 项
                  {upstream > 0 ? ` · 含 ${upstream} 项关联输入` : ""}
                </small>
              </div>
              <div className="handoff-items">
                {context.selection.map((item) => {
                  const input = context.inputSnapshot.items.find(
                    (i) => i.nodeId === item.nodeId,
                  );
                  return (
                    <div className="handoff-item" key={item.nodeId}>
                      <FileText size={14} />
                      <span>{item.title}</span>
                      <small>
                        {input?.version
                          ? `v${input.version}`
                          : item.instanceId
                            ? "制作流程"
                            : "便签"}
                      </small>
                    </div>
                  );
                })}
              </div>
            </div>
            <details
              className="handoff-preview"
              open={expanded}
              onToggle={(event) => setExpanded(event.currentTarget.open)}
            >
              <summary>
                查看引用详情
                <span>{Array.from(text).length.toLocaleString()} 字</span>
              </summary>
              <textarea
                ref={preview}
                aria-label="引用详情"
                readOnly
                value={text}
                spellCheck={false}
              />
            </details>
          </>
        )}
        {clipboardError && (
          <p className="handoff-error" role="alert">
            剪贴板访问受限，已选中引用。按 ⌘C 或 Ctrl+C 复制，再粘贴到 Codex。
          </p>
        )}
      </div>
      <div className="handoff-footer">
        <span role="status">
          {copied
            ? "已复制引用，等待粘贴到对话"
            : direct
              ? "添加后随下一条消息提供给 Codex"
              : "复制后粘贴即可引用"}
        </span>
        <div className="handoff-buttons">
          <button
            className={`button ${direct ? "small" : "primary"}`}
            disabled={!context || busy}
            onClick={copy}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "已复制引用" : "复制引用"}
          </button>
          {direct && (
            <button
              className="button primary"
              disabled={!context || busy}
              onClick={add}
            >
              {busy ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Link2 size={14} />
              )}
              添加引用
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
