import {
  studioVersion,
  studioBuildTimestamp,
  studioVersionMarker,
} from "../shared/version";
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { reloadWorkbench } from "./api";

export function VersionBadge() {
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className="studio-version"
        aria-label={`${reloading ? "正在重新加载工作台" : "重新加载工作台"} · ${studioVersionMarker}`}
        title={`Open Game Studio ${studioVersionMarker} · 点击强制重新加载整个工作台`}
        disabled={reloading}
        onClick={async () => {
          if (reloading) return;
          setReloading(true);
          setError("");
          try {
            await reloadWorkbench();
          } catch {
            setReloading(false);
            setError(
              "重新加载失败，当前工作台仍可使用。请点击版本号重试；若宿主不支持刷新，请关闭并重新打开工作台。",
            );
          }
        }}
      >
        {reloading ? (
          <Loader2 size={12} className="spin" />
        ) : (
          <RefreshCw size={12} />
        )}
        <span>v{studioVersion}</span>
        <span className="studio-version-build">-{studioBuildTimestamp}</span>
      </button>
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button
            className="button small"
            aria-label="关闭刷新提示"
            onClick={() => setError("")}
          >
            关闭
          </button>
        </div>
      )}
    </>
  );
}
