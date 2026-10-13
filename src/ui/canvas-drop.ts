// Read the drag store synchronously: browsers clear it after the drop event.
export interface CanvasImageDrop {
  files: File[];
  html: string;
  uriList: string;
  text: string;
}
const extensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const maxBytes = 200 * 1024 * 1024;
const imageName = /\.(png|jpe?g|webp|gif)$/i;
export function acceptsCanvasDrop(transfer: Pick<DataTransfer, "types">) {
  return transfer.types.some((type) =>
    [
      "application/studio-asset",
      "Files",
      "text/html",
      "text/uri-list",
      "text/plain",
    ].includes(type),
  );
}
export function captureCanvasImageDrop(
  transfer: DataTransfer,
): CanvasImageDrop {
  const files = Array.from(transfer.files);
  if (!files.length)
    for (const item of Array.from(transfer.items)) {
      const file = item.kind === "file" ? item.getAsFile() : null;
      if (file) files.push(file);
    }
  return {
    files,
    html: transfer.getData("text/html"),
    uriList: transfer.getData("text/uri-list"),
    text: transfer.getData("text/plain"),
  };
}
function validate(files: File[]) {
  if (!files.length) throw new Error("没有收到图片，请拖入图片文件。");
  if (files.length > 12) throw new Error("每次最多拖入 12 张图片。");
  if (files.some((file) => !imageName.test(file.name)))
    throw new Error("请拖入 PNG、JPG、WebP 或 GIF 图片。");
  if (files.some((file) => !file.size)) throw new Error("不能导入空图片。");
  if (files.reduce((total, file) => total + file.size, 0) > maxBytes)
    throw new Error("图片总大小超过 200 MB。");
  return files;
}
export async function resolveCanvasImages(
  drop: CanvasImageDrop,
): Promise<File[]> {
  // Native Codex/Finder drags may also include a URL. Import the actual files
  // once, without fetching a second copy from the HTML preview.
  if (drop.files.length) return validate(drop.files);
  const doc = new DOMParser().parseFromString(drop.html, "text/html");
  const images = Array.from(doc.querySelectorAll("img"));
  const sources = images.length
    ? images.map((image) => ({
        url: image.getAttribute("src") || "",
        name: image.getAttribute("alt") || "图片",
      }))
    : (drop.uriList || drop.text)
        .split(/\r?\n/)
        .map((url) => url.trim())
        .filter((url) => url && !url.startsWith("#"))
        .map((url) => ({ url, name: "图片" }));
  const unique = [
    ...new Map(sources.map((source) => [source.url, source])).values(),
  ];
  if (!unique.length) return validate([]);
  if (unique.length > 12) throw new Error("每次最多拖入 12 张图片。");
  const files: File[] = [];
  let total = 0;
  for (const source of unique) {
    let url: URL;
    try {
      url = new URL(source.url);
    } catch {
      throw new Error("没有收到可读取的图片，请将图片保存后拖入文件。");
    }
    if (
      !["data:", "blob:", "http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("此拖拽只传递了图片地址，请将图片保存后拖入文件。");
    if (
      url.protocol === "data:" &&
      (!/^data:image\/(png|jpeg|webp|gif)[;,]/i.test(source.url) ||
        source.url.length > Math.ceil(maxBytes / 3) * 4 + 100)
    )
      throw new Error("图片格式不支持或大小超过 200 MB。");
    let blob: Blob;
    try {
      if (url.protocol === "data:") {
        // Decode locally: opaque MCP hosts permit data: images but may forbid
        // fetch(data:) through connect-src. No host fetch is needed here.
        const comma = source.url.indexOf(",");
        const header = source.url.slice(5, comma);
        const payload = source.url.slice(comma + 1);
        const mime = header.split(";")[0].toLowerCase();
        const binary = /;base64$/i.test(header)
          ? atob(payload)
          : payload.replace(/%([\da-f]{2})/gi, (_, hex: string) =>
              String.fromCharCode(parseInt(hex, 16)),
            );
        if (total + binary.length > maxBytes)
          throw new Error("图片总大小超过 200 MB。");
        blob = new Blob(
          [Uint8Array.from(binary, (char) => char.charCodeAt(0))],
          { type: mime },
        );
      } else {
        const response = await fetch(source.url, {
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) throw new Error("图片读取失败");
        const mime =
          response.headers.get("content-type")?.split(";")[0].toLowerCase() ||
          "";
        if (!extensions[mime])
          throw new Error("请拖入 PNG、JPG、WebP 或 GIF 图片。");
        if (Number(response.headers.get("content-length")) > maxBytes - total)
          throw new Error("图片总大小超过 200 MB。");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("图片读取失败");
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (total + size > maxBytes)
              throw new Error("图片总大小超过 200 MB。");
            chunks.push(value);
          }
        } finally {
          await reader.cancel();
        }
        blob = new Blob(chunks, { type: mime });
      }
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "InvalidCharacterError"
      )
        throw new Error("图片编码无效，请将图片保存后拖入文件。");
      if (
        error instanceof TypeError ||
        (error instanceof DOMException && error.name === "TimeoutError")
      )
        throw new Error("无法读取这张图片，请将图片保存后拖入文件。");
      throw error;
    }
    total += blob.size;
    let name = source.name;
    if (url.protocol === "http:" || url.protocol === "https:") {
      try {
        name = decodeURIComponent(url.pathname.split("/").pop() || name);
      } catch {}
    }
    name =
      name
        .replace(/[\\/\x00-\x1f]/g, " ")
        .replace(/^\.+/, "")
        .trim()
        .slice(0, 180) || "图片";
    // Name by the received MIME so preview links without extensions work, too.
    name = name.replace(/\.(png|jpe?g|webp|gif)$/i, "");
    files.push(
      new File([blob], `${name}.${extensions[blob.type]}`, { type: blob.type }),
    );
  }
  return validate(files);
}
