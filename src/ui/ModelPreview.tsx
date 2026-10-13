import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, Maximize2, X } from "lucide-react";

type ViewerElement = HTMLElement & {
  loaded?: boolean;
  availableAnimations?: string[];
  cameraOrbit: string;
  cameraTarget: string;
  fieldOfView: string;
};

export function ModelPreview({
  src,
  name,
  interactive = true,
  detailed = false,
}: {
  src: string;
  name: string;
  interactive?: boolean;
  detailed?: boolean;
}) {
  // A different immutable asset version gets its own load and animation state.
  return (
    <ModelPreviewContent
      key={src}
      src={src}
      name={name}
      interactive={interactive}
      detailed={detailed}
    />
  );
}

function ModelPreviewContent({
  src,
  name,
  interactive,
  detailed,
}: {
  src: string;
  name: string;
  interactive: boolean;
  detailed: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [rotating, setRotating] = useState(true);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (expanded) dialogRef.current?.showModal();
  }, [expanded]);
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
      className={`model-preview nodrag nowheel nopan ${detailed ? "is-detailed" : ""} ${interactive ? "is-interactive" : "is-passive"}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {ready && (
        <model-viewer
          ref={viewerRef}
          src={src}
          alt={name}
          loading="eager"
          camera-controls={interactive || undefined}
          auto-rotate={rotating || undefined}
          autoplay={playing || undefined}
          animation-name={clip || undefined}
          interaction-prompt="none"
          shadow-intensity="1"
          exposure="1.0"
          environment-image="neutral"
          tabIndex={interactive ? 0 : -1}
          aria-hidden={interactive ? undefined : true}
        />
      )}
      {!detailed && (
        <button
          className="model-preview-expand"
          aria-label={`放大查看 ${name}`}
          title="放大查看"
          onClick={() => setExpanded(true)}
        >
          <Maximize2 size={16} />
        </button>
      )}
      {expanded &&
        createPortal(
          <dialog
            ref={dialogRef}
            className="model-preview-dialog"
            aria-label={`模型预览 ${name}`}
            onCancel={() => setExpanded(false)}
            onClose={() => setExpanded(false)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (event.target === event.currentTarget) setExpanded(false);
            }}
          >
            <header>
              <strong>{name}</strong>
              <button
                aria-label="关闭模型预览"
                onClick={() => setExpanded(false)}
              >
                <X size={20} />
              </button>
            </header>
            <ModelPreview src={src} name={name} detailed />
          </dialog>,
          document.body,
        )}
      {detailed && (
        <div className="model-preview-tools">
          <button
            aria-pressed={rotating}
            onClick={() => setRotating(!rotating)}
          >
            自动旋转{rotating ? "：开" : "：关"}
          </button>
          <button
            disabled={!clips.length}
            aria-pressed={playing}
            onClick={() => {
              setPlaying(!playing);
              const viewer = viewerRef.current as ViewerElement & {
                play(): void;
                pause(): void;
              };
              if (playing) viewer?.pause();
              else viewer?.play();
            }}
          >
            {playing ? "暂停动画" : "播放动画"}
          </button>
          <button
            onClick={() => {
              const viewer = viewerRef.current;
              if (viewer) {
                viewer.cameraOrbit = "0deg 75deg auto";
                viewer.cameraTarget = "auto auto auto";
                viewer.fieldOfView = "auto";
              }
            }}
          >
            重置视角
          </button>
        </div>
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
