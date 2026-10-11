import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

type ViewerElement = HTMLElement & {
  loaded?: boolean;
  availableAnimations?: string[];
};

export function ModelPreview({
  src,
  name,
  interactive = true,
}: {
  src: string;
  name: string;
  interactive?: boolean;
}) {
  // A different immutable asset version gets its own load and animation state.
  return (
    <ModelPreviewContent
      key={src}
      src={src}
      name={name}
      interactive={interactive}
    />
  );
}

function ModelPreviewContent({
  src,
  name,
  interactive,
}: {
  src: string;
  name: string;
  interactive: boolean;
}) {
  const viewerRef = useRef<ViewerElement>(null);
  const [ready, setReady] = useState(!!customElements.get("model-viewer"));
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [clips, setClips] = useState<string[]>([]);
  const [clip, setClip] = useState("");

  useEffect(() => {
    if (ready) return;
    let active = true;
    import("@google/model-viewer")
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setError("无法加载 3D 查看器");
      });
    return () => {
      active = false;
    };
  }, [ready]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer) return;
    const onLoad = () => {
      setLoaded(true);
      setError("");
      setClips(viewer.availableAnimations || []);
    };
    const onProgress = (event: Event) => {
      const total = (event as CustomEvent<{ totalProgress: number }>).detail
        ?.totalProgress;
      if (typeof total === "number")
        setProgress(Math.min(1, Math.max(0, total)));
    };
    const onError = (event: Event) => {
      const type = (event as CustomEvent<{ type?: string }>).detail?.type;
      setError(
        type === "webglcontextlost"
          ? "3D 预览已中断，请刷新重试"
          : "无法显示此模型，请检查 GLB 文件",
      );
    };
    viewer.addEventListener("load", onLoad);
    viewer.addEventListener("progress", onProgress);
    viewer.addEventListener("error", onError);
    if (viewer.loaded) onLoad();
    return () => {
      viewer.removeEventListener("load", onLoad);
      viewer.removeEventListener("progress", onProgress);
      viewer.removeEventListener("error", onError);
    };
  }, [ready]);

  return (
    <div
      className={`model-preview ${interactive ? "is-interactive" : "is-passive"}`}
    >
      {ready && (
        <model-viewer
          ref={viewerRef}
          src={src}
          alt={name}
          loading="eager"
          camera-controls={interactive || undefined}
          auto-rotate
          autoplay
          animation-name={clip || undefined}
          interaction-prompt="none"
          shadow-intensity="1"
          exposure="1.0"
          environment-image="neutral"
          tabIndex={interactive ? 0 : -1}
          aria-hidden={interactive ? undefined : true}
        />
      )}
      {(error || !loaded) && (
        <div
          className={`model-preview-state ${error ? "is-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {error ? (
            <AlertTriangle size={16} />
          ) : (
            <Loader2 className="spin" size={16} />
          )}
          <span>
            {error ||
              (!ready
                ? "正在加载 3D 查看器…"
                : progress > 0
                  ? `正在加载模型 ${Math.round(progress * 100)}%`
                  : "正在加载模型…")}
          </span>
        </div>
      )}
      {loaded && !error && (
        <>
          <span className="model-preview-hint">
            {interactive ? "拖动旋转 · 滚轮缩放" : "点击查看 · 自动旋转"}
          </span>
          {clips.length > 1 && (
            <select
              className="model-preview-clips nodrag nowheel nopan"
              aria-label={`${name} 动画`}
              value={clip || clips[0]}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setClip(event.target.value)}
            >
              {clips.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </>
      )}
    </div>
  );
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<ViewerElement>,
        ViewerElement
      > & {
        src: string;
        alt: string;
        loading?: string;
        "camera-controls"?: boolean;
        "auto-rotate"?: boolean;
        autoplay?: boolean;
        "animation-name"?: string;
        "interaction-prompt"?: string;
        "shadow-intensity"?: string;
        exposure?: string;
        "environment-image"?: string;
      };
    }
  }
}
