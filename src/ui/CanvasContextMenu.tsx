import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface CanvasMenuAction {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  hint?: string;
  run: () => unknown;
}
export function CanvasContextMenu({
  position,
  label,
  groups,
  onClose,
}: {
  position: { x: number; y: number };
  label: string;
  groups: CanvasMenuAction[][];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(position);
  useLayoutEffect(() => {
    const menu = ref.current!;
    const rect = menu.getBoundingClientRect();
    setAt({
      x: Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8)),
      y: Math.max(
        8,
        Math.min(position.y, window.innerHeight - rect.height - 8),
      ),
    });
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (e: PointerEvent) => {
      if (!menu.contains(e.target as globalThis.Node)) onClose();
    };
    const close = () => onClose();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", close);
    };
  }, [position.x, position.y]);
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className="canvas-context-menu"
      style={{ left: at.x, top: at.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          onClose();
          document.querySelector<HTMLElement>(".canvas-area")?.focus();
          return;
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const buttons = [
            ...ref.current!.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          ];
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }
      }}
    >
      <div className="canvas-context-title">{label}</div>
      {groups.map((group, i) => (
        <div key={i} className="canvas-context-group">
          {group.map((action) => (
            <button
              key={action.label}
              aria-label={action.label}
              role="menuitem"
              type="button"
              tabIndex={-1}
              disabled={action.disabled}
              className={action.danger ? "is-danger" : ""}
              onClick={() => {
                onClose();
                Promise.resolve()
                  .then(action.run)
                  .catch(() => {});
              }}
            >
              {action.icon}
              <span>{action.label}</span>
              {action.hint && <small>{action.hint}</small>}
            </button>
          ))}
        </div>
      ))}
    </div>,
    document.body,
  );
}
