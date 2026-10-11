import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Image as ImageIcon, Loader2, Upload, X } from "lucide-react";
import type {
  AssetRevision,
  Project,
  ProjectCover,
  ProjectSnapshot,
} from "../shared/types";
import { call, request, useAssetFileUrl } from "./api";

const coverPalettes = [
  { background: "#183d4b", accent: "#67d6cb", text: "#e5faf5" },
  { background: "#25395e", accent: "#85b7f5", text: "#edf4ff" },
  { background: "#41335d", accent: "#bda0ef", text: "#f5efff" },
  { background: "#563044", accent: "#f0a4ba", text: "#fff0f4" },
  { background: "#51402a", accent: "#eac17b", text: "#fff6e6" },
  { background: "#29463c", accent: "#98d3a9", text: "#effbf1" },
];

function ProjectNameCover({ name, alt }: { name: string; alt: string }) {
  const title = name.trim() || "未命名项目";
  const characters = Array.from(title);
  // Derive the palette from the name so it stays the same across views/reloads.
  let hash = 2166136261;
  for (const character of characters)
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  const palette = coverPalettes[(hash >>> 0) % coverPalettes.length];
  const style = {
    "--cover-background": palette.background,
    "--cover-accent": palette.accent,
    "--cover-text": palette.text,
    "--cover-title-size": characters.length > 18 ? "6cqw" : "9cqw",
  } as CSSProperties;
  return (
    <span
      className="project-name-cover"
      style={style}
      role="img"
      aria-label={alt}
    >
      <span className="project-name-cover-initials" aria-hidden="true">
        {characters.slice(0, 2).join("")}
      </span>
      <span
        className="project-name-cover-title"
        aria-hidden="true"
        title={title}
      >
        {title}
      </span>
    </span>
  );
}

export function ProjectCoverImage({
  projectId,
  projectName,
  cover,
  alt,
}: {
  projectId: string;
  projectName: string;
  cover?: ProjectCover | null;
  alt: string;
}) {
  const { url, error } = useAssetFileUrl(
    projectId,
    cover?.revisionId,
    cover?.fileIndex,
  );
  const [failedUrl, setFailedUrl] = useState<string>();
  if (!cover) return <ProjectNameCover name={projectName} alt={alt} />;
  if (cover && url && !error && failedUrl !== url)
    return <img src={url} alt={alt} onError={() => setFailedUrl(url)} />;
  return (
    <span className="project-cover-placeholder">
      {cover && !error && !url ? (
        <Loader2 size={22} className="spin" />
      ) : (
        <ImageIcon size={28} strokeWidth={1.3} />
      )}
      <span>
        {error || (url && failedUrl === url) ? "封面无法读取" : "正在读取封面…"}
      </span>
    </span>
  );
}

type Choice = ProjectCover & { name: string };

export function ProjectCoverModal({
  project,
  onClose,
  onSaved,
}: {
  project: Project;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<ProjectCover | null>(
    project.cover || null,
  );
  const [choices, setChoices] = useState<Choice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialogRef.current?.showModal();
    let active = true;
    request<ProjectSnapshot>(`/api/projects/${project.id}`)
      .then((snapshot) => {
        if (!active) return;
        setChoices(
          snapshot.assets
            .filter((asset) => !asset.archived)
            .flatMap((asset) => {
              const revision = asset.revisions.find(
                (r) => r.id === asset.latestRevisionId,
              );
              return (
                revision?.files.flatMap((file, fileIndex) =>
                  file.mime.startsWith("image/")
                    ? [
                        {
                          revisionId: revision.id,
                          fileIndex,
                          name: `${asset.name} · ${file.name}`,
                        },
                      ]
                    : [],
                ) || []
              );
            }),
        );
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project.id]);

  async function upload(file: File) {
    setError("");
    if (!/\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
      setError("请选择 PNG、JPG、WebP 或 GIF 图片");
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      setError("图片超过 200 MB");
      return;
    }
    setBusy(true);
    try {
      // Check that the browser can render the image before adding it to resources.
      const previewUrl = URL.createObjectURL(file);
      try {
        const image = new Image();
        image.src = previewUrl;
        await image.decode();
      } finally {
        URL.revokeObjectURL(previewUrl);
      }
      const form = new FormData();
      form.append("files", file);
      const revision = await request<AssetRevision>(
        `/api/projects/${project.id}/import`,
        { method: "POST", body: form },
      );
      const choice = { revisionId: revision.id, fileIndex: 0, name: file.name };
      setChoices((items) => [...items, choice]);
      setSelected({ revisionId: choice.revisionId, fileIndex: 0 });
    } catch (e) {
      setError(
        e instanceof Error && e.name === "EncodingError"
          ? "无法读取这张图片，请选择有效的图片文件"
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await call("project_manage", {
        action: "update",
        projectId: project.id,
        cover: selected,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="cover-modal"
      aria-labelledby="cover-modal-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id="cover-modal-title">设置项目封面</h2>
        <button
          className="icon-button"
          aria-label="关闭"
          disabled={busy}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <div className="modal-body">
        <p className="modal-description">
          {project.name} · 从已导入的图片中选择，或上传新的封面。
        </p>
        <div className="cover-preview">
          <ProjectCoverImage
            projectId={project.id}
            projectName={project.name}
            cover={selected}
            alt="项目封面预览"
          />
        </div>
        <div className="cover-picker-heading">
          <h3>项目图片</h3>
          <button
            className="button small"
            disabled={busy || loading}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Upload size={14} />
            )}
            上传图片
          </button>
        </div>
        <input
          ref={fileRef}
          className="hidden"
          type="file"
          aria-label="上传封面图片"
          accept=".png,.jpg,.jpeg,.webp,.gif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
        <p className="cover-help">
          支持 PNG、JPG、WebP、GIF。上传的图片会加入项目资源，保存后作为封面。
        </p>
        {loading ? (
          <p className="cover-help" role="status">
            正在读取项目图片…
          </p>
        ) : choices.length ? (
          <div className="cover-image-grid">
            {choices.map((choice) => {
              const active =
                selected?.revisionId === choice.revisionId &&
                selected.fileIndex === choice.fileIndex;
              return (
                <button
                  key={`${choice.revisionId}/${choice.fileIndex}`}
                  className={`cover-choice${active ? " selected" : ""}`}
                  aria-label={choice.name}
                  aria-pressed={active}
                  title={choice.name}
                  disabled={busy}
                  onClick={() =>
                    setSelected({
                      revisionId: choice.revisionId,
                      fileIndex: choice.fileIndex,
                    })
                  }
                >
                  <div className="cover-choice-image">
                    <ProjectCoverImage
                      projectId={project.id}
                      projectName={project.name}
                      cover={choice}
                      alt={choice.name}
                    />
                  </div>
                  <span className="cover-choice-name">{choice.name}</span>
                  {active && (
                    <span className="cover-choice-check">
                      <Check size={12} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="cover-empty">
            还没有可用图片，上传一张作为项目封面。
          </div>
        )}
        {error && (
          <p className="cover-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button
            className="text-button cover-remove"
            disabled={!selected || busy}
            onClick={() => setSelected(null)}
          >
            移除封面
          </button>
          <button className="button small" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            className="button small primary"
            disabled={busy || loading}
            onClick={() => void save()}
          >
            {busy && <Loader2 size={14} className="spin" />}保存封面
          </button>
        </div>
      </div>
    </dialog>
  );
}
