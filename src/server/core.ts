import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  statSync,
  copyFileSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import type {
  GenerationTask,
  Asset,
  AssetFile,
  AssetKind,
  AssetRevision,
  Canvas,
  CanvasInputSnapshot,
  ExportBundle,
  Project,
  ProjectSnapshot,
  ReviewDecision,
  StudioNode,
  WorkflowRun,
  WorkflowStep,
} from "../shared/types.js";
import {
  canvasConnectionError,
  canvasInputPrompt,
  resolveCanvasInputs,
} from "../shared/canvas-inputs.js";

export class StudioError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(message: string, status = 400): never {
  throw new StudioError(status, message);
}
const uid = (prefix: string) => `${prefix}_${randomUUID()}`;
const now = () => new Date().toISOString();
const json = (v: unknown) => JSON.stringify(v);
const nameSchema = z.string().trim().min(1).max(120);
const idSchema = z.string().min(1).max(100);
const position = z.object({
  x: z.number().finite().min(-100000).max(100000),
  y: z.number().finite().min(-100000).max(100000),
});
const nodeSchema = z.object({
  id: idSchema,
  type: z.enum(["asset", "note", "workflow", "generation"]),
  position,
  data: z.object({
    title: nameSchema,
    assetId: idSchema.optional(),
    revisionId: idSchema.optional(),
    text: z.string().max(30000).optional(),
    instanceId: idSchema.optional(),
    taskId: idSchema.optional(),
  }),
});
const edgeSchema = z.object({
  id: idSchema,
  source: idSchema,
  target: idSchema,
  kind: z.literal("reference"),
});
const templateVersion = "character-v1.0.0";
const phases: Array<{
  key: string;
  title: string;
  mode: WorkflowStep["mode"];
  note: string;
}> = [
  {
    key: "brief",
    title: "角色目标",
    mode: "agent",
    note: "写明造型、引擎与质量目标，提交 Brief 文档。",
  },
  {
    key: "reference",
    title: "制作参考",
    mode: "manual",
    note: "导入一致的角色参考图或多视图。",
  },
  {
    key: "candidate",
    title: "模型候选",
    mode: "manual",
    note: "尚未接入模型服务。请导入一个或多个 GLB 候选。",
  },
  {
    key: "appearance",
    title: "候选审核",
    mode: "review",
    note: "浏览候选不会改变选择。明确采用一个版本，或反馈返修。",
  },
  {
    key: "assembly",
    title: "整理与组装",
    mode: "manual",
    note: "提交同一次制作的可编辑 Blend 与 GLB 文件集。",
  },
  {
    key: "rig",
    title: "绑定与变形",
    mode: "manual",
    note: "提交绑定后的 Blend 与 GLB。实际变形质量在下一步审核。",
  },
  {
    key: "deformation",
    title: "变形审核",
    mode: "review",
    note: "在制作工具中检查肩、肘、髋、膝与服饰，记录真实观察。",
  },
  {
    key: "delivery",
    title: "成果交接",
    mode: "local",
    note: "组织固定版本、校验 hash 并导出 manifest。引擎验收保持未验证。",
  },
];
function openDb(file: string) {
  const d = new DatabaseSync(file);
  d.exec(
    "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;",
  );
  return d;
}
function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const v = fn();
    db.exec("COMMIT");
    return v;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
function rows<T>(db: DatabaseSync, table: string): T[] {
  return (
    db.prepare(`SELECT data FROM ${table}`).all() as { data: string }[]
  ).map((r) => JSON.parse(r.data));
}
function inputAssets(db: DatabaseSync): Asset[] {
  const revisions = rows<AssetRevision>(db, "revisions");
  return rows<Asset>(db, "assets").map((asset) => ({
    ...asset,
    revisions: revisions.filter((r) => r.assetId === asset.id),
  }));
}
function get<T>(db: DatabaseSync, table: string, id: string): T {
  const r = db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id) as
    | { data: string }
    | undefined;
  if (!r) fail("对象不存在", 404);
  return JSON.parse(r!.data);
}
function put<T extends { id: string }>(
  db: DatabaseSync,
  table: string,
  obj: T,
) {
  db.prepare(
    `INSERT INTO ${table}(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
  ).run(obj.id, json(obj));
}
function createProjectTables(db: DatabaseSync) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL); ${["assets", "revisions", "canvases", "runs", "reviews", "exports", "plans", "operations", "tasks"].map((t) => `CREATE TABLE IF NOT EXISTS ${t}(id TEXT PRIMARY KEY,data TEXT NOT NULL);`).join(" ")} CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);`,
  );
}
function event(db: DatabaseSync, kind: string, data: unknown) {
  db.prepare("INSERT INTO events(kind,data,created_at) VALUES (?,?,?)").run(
    kind,
    json(data),
    now(),
  );
}
function cas(actual: number, expected: number) {
  if (actual !== expected)
    fail(
      `版本冲突：当前版本 ${actual}，请求版本 ${expected}。请刷新后重试。`,
      409,
    );
}
function within(root: string, file: string) {
  const resolved = realpathSync(file);
  const rel = path.relative(realpathSync(root), resolved);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
    fail("文件位于登记的项目目录之外", 403);
  return resolved;
}
function safeDir(root: string, dir: string) {
  mkdirSync(dir, { recursive: true });
  return within(root, dir);
}
function identify(
  name: string,
  bytes: Buffer,
): { kind: AssetKind; mime: string; role: AssetFile["role"] } {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".glb") {
    if (
      bytes.length < 20 ||
      bytes.toString("ascii", 0, 4) !== "glTF" ||
      bytes.readUInt32LE(4) !== 2 ||
      bytes.readUInt32LE(8) !== bytes.length
    )
      fail("GLB 文件头、版本或长度无效");
    let offset = 12;
    let first = true;
    while (offset < bytes.length) {
      if (offset + 8 > bytes.length) fail("GLB 数据块不完整");
      const len = bytes.readUInt32LE(offset);
      const type = bytes.readUInt32LE(offset + 4);
      if (len % 4 !== 0 || offset + 8 + len > bytes.length)
        fail("GLB 数据块长度无效");
      if (first) {
        if (type !== 0x4e4f534a) fail("GLB 缺少 JSON 数据块");
        try {
          const doc = JSON.parse(
            bytes
              .toString("utf8", offset + 8, offset + 8 + len)
              .replace(/\0+$/, ""),
          );
          if (doc.asset?.version !== "2.0") fail("GLB 资产版本无效");
          for (const item of [...(doc.buffers ?? []), ...(doc.images ?? [])])
            if (item.uri && !item.uri.startsWith("data:"))
              fail("首版仅支持自包含 GLB，不接受外部文件引用");
        } catch (e) {
          if (e instanceof StudioError) throw e;
          fail("GLB JSON 无效");
        }
        first = false;
      }
      offset += 8 + len;
    }
    return { kind: "model", mime: "model/gltf-binary", role: "runtime" };
  }
  if (ext === ".blend") {
    if (bytes.length < 12 || bytes.toString("ascii", 0, 7) !== "BLENDER")
      fail("Blend 文件头无效；压缩 Blend 暂不支持");
    return { kind: "source", mime: "application/octet-stream", role: "source" };
  }
  const imageMatch =
    (ext === ".png" &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    ([".jpg", ".jpeg"].includes(ext) &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255) ||
    (ext === ".webp" &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP") ||
    (ext === ".gif" &&
      ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6)));
  if (imageMatch)
    return {
      kind: "image",
      mime:
        ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : `image/${ext.slice(1)}`,
      role: "preview",
    };
  if ([".md", ".txt", ".json"].includes(ext)) {
    if (bytes.includes(0)) fail("文档包含二进制内容");
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (ext === ".json") {
      try {
        JSON.parse(bytes.toString());
      } catch {
        fail("JSON 文档无法解析");
      }
    }
    return { kind: "document", mime: "text/plain", role: "source" };
  }
  if (ext === ".mp4" && bytes.toString("ascii", 4, 8) === "ftyp")
    return { kind: "video", mime: "video/mp4", role: "source" };
  if (
    ext === ".wav" &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WAVE"
  )
    return { kind: "audio", mime: "audio/wav", role: "source" };
  if (
    ext === ".mp3" &&
    (bytes.toString("ascii", 0, 3) === "ID3" ||
      (bytes[0] === 255 && (bytes[1] & 224) === 224))
  )
    return { kind: "audio", mime: "audio/mpeg", role: "source" };
  if (
    ext === ".webm" &&
    bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  )
    return { kind: "video", mime: "video/webm", role: "source" };
  if (ext === ".ogg" && bytes.toString("ascii", 0, 4) === "OggS")
    return { kind: "audio", mime: "audio/ogg", role: "source" };
  if (ext === ".m4a" && bytes.toString("ascii", 4, 8) === "ftyp")
    return { kind: "audio", mime: "audio/mp4", role: "source" };
  if (
    [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".css",
      ".html",
      ".gd",
      ".py",
      ".shader",
      ".glsl",
      ".cs",
      ".toml",
      ".yaml",
      ".yml",
    ].includes(ext)
  ) {
    if (bytes.includes(0)) fail("源文件包含二进制内容");
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { kind: "source", mime: "text/plain", role: "source" };
  }
  fail(
    "文件格式无效或尚未支持。可导入 PNG、JPG、WebP、GIF、GLB、未压缩 Blend、MD、TXT、JSON、MP4、WebM、WAV、MP3、OGG、M4A 和常见代码源文件。",
  );
}
export interface ImportFile {
  name: string;
  bytes: Buffer;
}
export class StudioCore {
  registry: DatabaseSync;
  constructor(
    public configDir = process.env.STUDIO_HOME ||
      path.join(os.homedir(), ".game-studio"),
  ) {
    mkdirSync(configDir, { recursive: true });
    this.registry = openDb(path.join(configDir, "registry.db"));
    this.registry.exec(
      "CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,data TEXT NOT NULL);",
    );
  }
  close() {
    this.registry.close();
  }
  listProjects(): Project[] {
    return rows<Project>(this.registry, "projects")
      .map((p) => ({
        ...p,
        available: existsSync(path.join(p.root, ".game-studio", "studio.db")),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  db(projectId: string): { db: DatabaseSync; project: Project } {
    const p = get<Project>(this.registry, "projects", projectId);
    if (!existsSync(p.root)) fail("项目目录丢失，请重新定位目录", 409);
    const file = path.join(p.root, ".game-studio", "studio.db");
    if (!existsSync(file)) fail("项目数据库丢失，请重新定位原项目", 409);
    within(p.root, file);
    const d = openDb(file);
    if (
      !d
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'",
        )
        .get()
    )
      d.exec(
        "CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,data TEXT NOT NULL)",
      );
    return { db: d, project: p };
  }
  inProject<T>(id: string, fn: (db: DatabaseSync, p: Project) => T): T {
    const { db, project } = this.db(id);
    try {
      return fn(db, project);
    } finally {
      db.close();
    }
  }
  projectManage(input: unknown) {
    const a = z
      .object({
        action: z.enum(["create", "link", "update", "relocate"]),
        projectId: idSchema.optional(),
        name: nameSchema.optional(),
        root: z.string().min(1).max(4096).optional(),
        engine: z.enum(["godot", "unity", "unreal", "other"]).optional(),
        collection: z.string().max(120).optional(),
        archived: z.boolean().optional(),
        cover: z
          .object({
            revisionId: idSchema,
            fileIndex: z.number().int().nonnegative(),
          })
          .nullable()
          .optional(),
      })
      .parse(input);
    if (a.action === "create" || a.action === "link") {
      const name = nameSchema.parse(a.name);
      if (!a.root || !path.isAbsolute(a.root)) fail("请提供项目的绝对目录");
      if (existsSync(a.root) && !statSync(a.root).isDirectory())
        fail("项目路径已被文件占用，请选择文件夹", 409);
      if (a.action === "create" && !existsSync(a.root)) {
        mkdirSync(a.root, { recursive: true });
      }
      if (!existsSync(a.root) || !statSync(a.root).isDirectory())
        fail("项目目录不存在");
      const root = realpathSync(a.root);
      const registered = this.listProjects().find((p) => p.root === root);
      if (registered) return registered;
      const dir = path.join(root, ".game-studio");
      safeDir(root, dir);
      const file = path.join(dir, "studio.db");
      if (existsSync(file)) within(root, file);
      const db = openDb(file);
      createProjectTables(db);
      try {
        const stored = db
          .prepare("SELECT value FROM meta WHERE key='projectId'")
          .get() as { value: string } | undefined;
        const project: Project = {
          id: stored?.value || uid("p"),
          name,
          root,
          engine: a.engine || "godot",
          collection: a.collection || "",
          archived: false,
          createdAt: now(),
          updatedAt: now(),
          available: true,
        };
        db.prepare(
          "INSERT OR IGNORE INTO meta(key,value) VALUES ('projectId',?)",
        ).run(project.id);
        if (rows<Canvas>(db, "canvases").length === 0)
          this.createCanvas(db, "角色探索");
        put(this.registry, "projects", project);
        return project;
      } finally {
        db.close();
      }
    }
    const p = get<Project>(
      this.registry,
      "projects",
      idSchema.parse(a.projectId),
    );
    if (a.action === "relocate") {
      if (!a.root || !path.isAbsolute(a.root)) fail("请提供绝对目录");
      const root = realpathSync(a.root);
      const file = within(root, path.join(root, ".game-studio", "studio.db"));
      const d = openDb(file);
      try {
        const stored = d
          .prepare("SELECT value FROM meta WHERE key='projectId'")
          .get() as { value: string } | undefined;
        if (stored?.value !== p.id) fail("该目录不是此项目，项目身份不一致");
      } finally {
        d.close();
      }
      p.root = root;
    } else {
      if (a.cover !== undefined) {
        if (a.cover === null) delete p.cover;
        else {
          const { file, metadata } = this.assetFile(
            p.id,
            a.cover.revisionId,
            a.cover.fileIndex,
          );
          if (!metadata.mime.startsWith("image/"))
            fail("项目封面必须是图片资源");
          if (
            createHash("sha256").update(readFileSync(file)).digest("hex") !==
            metadata.sha256
          )
            fail("图片文件已被修改，请重新导入后设置封面", 409);
          p.cover = a.cover;
        }
      }
      if (a.name) p.name = a.name;
      if (a.engine) p.engine = a.engine;
      if (a.collection !== undefined) p.collection = a.collection;
      if (a.archived !== undefined) p.archived = a.archived;
    }
    p.updatedAt = now();
    put(this.registry, "projects", p);
    return p;
  }
  private createCanvas(db: DatabaseSync, name: string): Canvas {
    const c: Canvas = {
      id: uid("c"),
      name,
      archived: false,
      graphRevision: 0,
      layoutRevision: 0,
      nodes: [],
      edges: [],
      instances: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: now(),
    };
    put(db, "canvases", c);
    return c;
  }
  snapshot(projectId: string): ProjectSnapshot {
    return this.inProject(projectId, (db, project) => {
      db.exec("BEGIN");
      try {
        const revisions = rows<AssetRevision>(db, "revisions");
        const byAsset = new Map<string, AssetRevision[]>();
        for (const r of revisions) {
          const bucket = byAsset.get(r.assetId) || [];
          bucket.push(r);
          byAsset.set(r.assetId, bucket);
        }
        const snapshot = {
          project: { ...project, available: true },
          assets: rows<Asset>(db, "assets").map((a) => ({
            ...a,
            revisions: (byAsset.get(a.id) || []).sort(
              (a, b) => b.number - a.number,
            ),
          })),
          canvases: rows<Canvas>(db, "canvases"),
          tasks: rows<GenerationTask>(db, "tasks"),
          runs: rows<WorkflowRun>(db, "runs"),
          reviews: rows<ReviewDecision>(db, "reviews"),
          exports: rows<ExportBundle>(db, "exports"),
        };
        db.exec("COMMIT");
        return snapshot;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    });
  }
  importFiles(
    projectId: string,
    files: ImportFile[],
    options: {
      name?: string;
      assetId?: string;
      parentRevisionIds?: string[];
      runId?: string;
      sourceRef?: string;
      generationBinding?: {
        taskId: string;
        expectedRevision: number;
        summary: string;
      };
      expectedLatestRevisionId?: string;
      canvasBinding?: {
        canvasId: string;
        nodeId: string;
        expectedRevision: number;
        position: { x: number; y: number };
      };
    } = {},
  ): AssetRevision {
    if (!files.length || files.length > 12) fail("每次提交 1 至 12 个文件");
    if (files.reduce((n, f) => n + f.bytes.length, 0) > 200 * 1024 * 1024)
      fail("文件集超过 200 MB");
    const classified = files.map((f) => {
      if (f.bytes.length === 0) fail("不能导入空文件");
      const name = path.basename(f.name.replaceAll("\\", "/")).normalize("NFC");
      if (
        !name ||
        name.length > 220 ||
        name.startsWith(".") ||
        /[\x00-\x1f]/.test(name)
      )
        fail("文件名无效");
      return { ...f, name, ...identify(name, f.bytes) };
    });
    if (
      new Set(classified.map((f) => f.name.toLowerCase())).size !== files.length
    )
      fail("文件集中有重复文件名");
    return this.inProject(projectId, (db, p) => {
      const old = options.assetId
        ? get<Asset>(db, "assets", options.assetId)
        : undefined;
      const assetId = old?.id || uid("a");
      const revId = uid("rev");
      const store = safeDir(
        p.root,
        path.join(p.root, ".game-studio", "assets", assetId),
      );
      const stage = safeDir(
        p.root,
        path.join(p.root, ".game-studio", "work", revId),
      );
      const target = path.join(store, revId);
      try {
        const recordFiles: AssetFile[] = classified.map((f) => {
          writeFileSync(path.join(stage, f.name), f.bytes, { flag: "wx" });
          return {
            name: f.name,
            relativePath: path.relative(p.root, path.join(target, f.name)),
            sizeBytes: f.bytes.length,
            sha256: createHash("sha256").update(f.bytes).digest("hex"),
            mime: f.mime,
            role: f.role,
          };
        });
        renameSync(stage, target);
        return transaction(db, () => {
          if (
            options.expectedLatestRevisionId &&
            old?.latestRevisionId !== options.expectedLatestRevisionId
          )
            fail("文档已有新版本，请重新打开后保存", 409);
          for (const parent of options.parentRevisionIds || [])
            get<AssetRevision>(db, "revisions", parent);
          if (old) {
            cas(get<Asset>(db, "assets", old.id).revision, old.revision);
          }
          const r: AssetRevision = {
            id: revId,
            assetId,
            projectId,
            number:
              (old
                ? get<AssetRevision>(db, "revisions", old.latestRevisionId)
                    .number
                : 0) + 1,
            files: recordFiles,
            parentRevisionIds: options.parentRevisionIds || [],
            createdByRunId: options.runId,
            provenance: { sourceRef: options.sourceRef || "用户导入" },
            createdAt: now(),
          };
          const a: Asset = {
            id: assetId,
            name: nameSchema.parse(
              options.name || old?.name || path.parse(classified[0].name).name,
            ),
            kind: classified.some((f) => f.kind === "model")
              ? "model"
              : classified[0].kind,
            tags: old?.tags || [],
            archived: false,
            revision: (old?.revision || 0) + 1,
            latestRevisionId: revId,
            createdAt: old?.createdAt || now(),
            revisions: [],
          };
          if (options.canvasBinding) {
            const b = options.canvasBinding;
            const c = get<Canvas>(db, "canvases", b.canvasId);
            cas(c.graphRevision, b.expectedRevision);
            const n = c.nodes.find((n) => n.id === b.nodeId);
            if (
              n &&
              (n.type !== "asset" ||
                n.data.assetId !== assetId ||
                n.data.revisionId !== options.expectedLatestRevisionId)
            )
              fail("文档节点已变化，请重新打开", 409);
            if (!n && old) fail("文档节点已移除", 409);
            if (n) n.data = { title: a.name, assetId, revisionId: revId };
            else
              c.nodes.push({
                id: b.nodeId,
                type: "asset",
                position: b.position,
                data: { title: a.name, assetId, revisionId: revId },
              });
            c.graphRevision++;
            c.updatedAt = now();
            put(db, "canvases", c);
          }
          if (options.generationBinding) {
            const b = options.generationBinding;
            this.bindGeneration(db, b.taskId, b.expectedRevision, r, b.summary);
          }
          put(db, "revisions", r);
          put(db, "assets", a);
          event(db, "asset.imported", { assetId, revisionId: revId });
          return r;
        });
      } catch (e) {
        rmSync(stage, { recursive: true, force: true });
        /* Published but unregistered directories are retained for recovery. */ throw e;
      }
    });
  }
  importPaths(
    projectId: string,
    fileRefs: string[],
    options: Parameters<StudioCore["importFiles"]>[2] = {},
  ) {
    return this.inProject(projectId, (_db, p) => {
      const files = fileRefs.map((file) => {
        const source = within(p.root, path.resolve(p.root, file));
        if (
          !statSync(source).isFile() ||
          statSync(source).size > 200 * 1024 * 1024
        )
          fail("文件太大或不是普通文件");
        return { name: path.basename(source), bytes: readFileSync(source) };
      });
      return this.importFiles(projectId, files, {
        ...options,
        sourceRef: options.sourceRef || fileRefs.join(", "),
      });
    });
  }
  documentSave(input: unknown) {
    const a = z
      .object({
        projectId: idSchema,
        canvasId: idSchema,
        nodeId: idSchema.optional(),
        expectedRevision: z.number().int(),
        assetId: idSchema.optional(),
        expectedLatestRevisionId: idSchema.optional(),
        name: nameSchema,
        text: z.string().max(300000),
        position: position.default({ x: 100, y: 100 }),
      })
      .parse(input);
    if (a.assetId) {
      const asset = this.snapshot(a.projectId).assets.find(
        (x) => x.id === a.assetId,
      );
      if (!asset || asset.kind !== "document") fail("只能编辑文档资源");
      if (!a.expectedLatestRevisionId || !a.nodeId)
        fail("编辑文档需要指定原版本和节点");
    }
    return this.importFiles(
      a.projectId,
      [{ name: "document.md", bytes: Buffer.from(a.text || "\n") }],
      {
        name: a.name,
        assetId: a.assetId,
        expectedLatestRevisionId: a.expectedLatestRevisionId,
        parentRevisionIds: a.expectedLatestRevisionId
          ? [a.expectedLatestRevisionId]
          : [],
        sourceRef: "画布文档编辑",
        canvasBinding: {
          canvasId: a.canvasId,
          nodeId: a.nodeId || uid("n"),
          expectedRevision: a.expectedRevision,
          position: a.position,
        },
      },
    );
  }
  generationCreate(input: unknown): GenerationTask {
    const a = z
      .object({
        projectId: idSchema,
        canvasId: idSchema,
        expectedRevision: z.number().int(),
        kind: z.enum(["image", "video", "model", "animation", "audio"]),
        name: nameSchema,
        prompt: z.string().trim().min(1).max(30000),
        inputNodeIds: z.array(idSchema).max(20).default([]),
        position,
        idempotencyKey: idSchema,
        settings: z
          .object({
            aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3"]).optional(),
            duration: z.number().int().min(1).max(60).optional(),
            animation: z.string().max(100).optional(),
            transparent: z.boolean().optional(),
          })
          .default({}),
      })
      .parse(input);
    return this.inProject(a.projectId, (db, p) =>
      transaction(db, () => {
        const existing = rows<GenerationTask>(db, "tasks").find(
          (t) => t.idempotencyKey === a.idempotencyKey,
        );
        if (existing) {
          if (
            existing.canvasId !== a.canvasId ||
            existing.kind !== a.kind ||
            existing.prompt !== a.prompt ||
            existing.name !== a.name ||
            json(existing.settings) !== json(a.settings) ||
            json(existing.inputSnapshot.targetNodeIds) !== json(a.inputNodeIds)
          )
            fail("幂等键已用于另一组参数", 409);
          return existing;
        }
        const c = get<Canvas>(db, "canvases", a.canvasId);
        cas(c.graphRevision, a.expectedRevision);
        if (c.archived) fail("画布已归档");
        const inputSnapshot = this.freezeInputs(
          this.resolveInputs(c, a.inputNodeIds, inputAssets(db)),
          p,
        );
        if (
          a.kind === "animation" &&
          !inputSnapshot.items.some((i) => i.kind === "model")
        )
          fail("绑定动画需要一个 3D 模型参考");
        const t: GenerationTask = {
          id: uid("gen"),
          projectId: a.projectId,
          canvasId: a.canvasId,
          nodeId: uid("n"),
          kind: a.kind,
          name: a.name,
          prompt: a.prompt,
          settings: a.settings,
          inputSnapshot,
          status: "draft",
          revision: 0,
          idempotencyKey: a.idempotencyKey,
          createdAt: now(),
          updatedAt: now(),
        };
        c.nodes.push({
          id: t.nodeId,
          type: "generation",
          position: a.position,
          data: { title: t.name, taskId: t.id },
        });
        for (const source of a.inputNodeIds)
          c.edges.push({
            id: uid("e"),
            source,
            target: t.nodeId,
            kind: "reference",
          });
        c.graphRevision++;
        c.updatedAt = now();
        put(db, "canvases", c);
        put(db, "tasks", t);
        event(db, "generation.created", { taskId: t.id });
        return t;
      }),
    );
  }
  generationGet(projectId: string, taskId: string) {
    return this.inProject(projectId, (db, p) => {
      const task = get<GenerationTask>(db, "tasks", taskId);
      const referenceFiles = task.inputSnapshot.items.flatMap((i) =>
        (i.files || []).map((f) => ({
          ...f,
          fileRef: path.join(p.root, f.relativePath),
        })),
      );
      return { task, projectRoot: p.root, referenceFiles };
    });
  }
  generationUpdate(
    projectId: string,
    taskId: string,
    expectedRevision: number,
    changes: Partial<GenerationTask>,
    allowed: GenerationTask["status"][],
  ) {
    return this.inProject(projectId, (db) =>
      transaction(db, () => {
        const t = get<GenerationTask>(db, "tasks", taskId);
        cas(t.revision, expectedRevision);
        if (!allowed.includes(t.status))
          fail(`当前任务状态不允许此操作：${t.status}`, 409);
        Object.assign(t, changes);
        t.revision++;
        t.updatedAt = now();
        put(db, "tasks", t);
        event(db, "generation.updated", { taskId, status: t.status });
        return t;
      }),
    );
  }
  generationComplete(
    projectId: string,
    taskId: string,
    expectedRevision: number,
    fileRefs: string[],
    summary: string,
  ) {
    const { task } = this.generationGet(projectId, taskId);
    cas(task.revision, expectedRevision);
    if (task.status !== "running") fail("任务未在执行", 409);
    const files = this.inProject(projectId, (_db, p) =>
      fileRefs.map((ref) => {
        const file = within(p.root, path.resolve(p.root, ref));
        if (!statSync(file).isFile() || statSync(file).size > 200 * 1024 * 1024)
          fail("产物文件无效");
        const bytes = readFileSync(file),
          name = path.basename(file);
        return { name, bytes, kind: identify(name, bytes).kind };
      }),
    );
    const target = task.kind === "animation" ? "model" : task.kind;
    if (!files.some((f) => f.kind === target)) fail("产物类型与生成任务不匹配");
    if (task.kind === "animation") {
      const f = files.find((f) => f.name.endsWith(".glb"));
      if (!f) fail("动画产物需要 GLB");
      const data = JSON.parse(
        f.bytes.toString("utf8", 20, 20 + f.bytes.readUInt32LE(12)).trim(),
      );
      if (!data.animations?.length || !data.skins?.length)
        fail("动画产物必须包含骨架和动画片段");
    }
    this.importFiles(projectId, files, {
      name: task.name,
      parentRevisionIds: task.inputSnapshot.revisionIds,
      sourceRef: `Codex 生成任务 ${task.id}`,
      generationBinding: { taskId, expectedRevision, summary },
    });
    return this.generationGet(projectId, taskId).task;
  }
  private bindGeneration(
    db: DatabaseSync,
    taskId: string,
    expectedRevision: number,
    revision: AssetRevision,
    summary: string,
  ) {
    const t = get<GenerationTask>(db, "tasks", taskId);
    cas(t.revision, expectedRevision);
    if (!["running", "failed", "interrupted", "draft"].includes(t.status))
      fail("任务已结束", 409);
    const c = get<Canvas>(db, "canvases", t.canvasId),
      n = c.nodes.find((n) => n.id === t.nodeId);
    if (n?.type === "generation" && n.data.taskId === taskId) {
      n.type = "asset";
      n.data = {
        title: t.name,
        assetId: revision.assetId,
        revisionId: revision.id,
        taskId,
      };
      c.graphRevision++;
      c.updatedAt = now();
      put(db, "canvases", c);
    }
    t.status = "succeeded";
    t.outputRevisionId = revision.id;
    t.summary = summary;
    t.error = undefined;
    t.revision++;
    t.updatedAt = now();
    put(db, "tasks", t);
    event(db, "generation.completed", { taskId, revisionId: revision.id });
    return t;
  }
  generationAdopt(input: {
    projectId: string;
    taskId: string;
    expectedRevision: number;
    revisionId: string;
  }) {
    const { task } = this.generationGet(input.projectId, input.taskId);
    const asset = this.snapshot(input.projectId).assets.find((a) =>
      a.revisions.some((r) => r.id === input.revisionId),
    );
    if (
      !asset ||
      asset.kind !== (task.kind === "animation" ? "model" : task.kind)
    )
      fail("产物类型与任务不匹配");
    const revision = asset.revisions.find((r) => r.id === input.revisionId)!;
    for (let i = 0; i < revision.files.length; i++) {
      const { file, metadata } = this.assetFile(
        input.projectId,
        revision.id,
        i,
      );
      const bytes = readFileSync(file);
      if (createHash("sha256").update(bytes).digest("hex") !== metadata.sha256)
        fail("产物文件已被修改", 409);
    }
    if (task.kind === "animation") {
      const i = revision.files.findIndex((f) => f.mime === "model/gltf-binary");
      if (i < 0) fail("动画产物需要 GLB");
      const bytes = readFileSync(
        this.assetFile(input.projectId, revision.id, i).file,
      );
      const data = JSON.parse(
        bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)).trim(),
      );
      if (!data.animations?.length || !data.skins?.length)
        fail("动画产物必须包含骨架和动画片段");
    }
    return this.inProject(input.projectId, (db) =>
      transaction(db, () =>
        this.bindGeneration(
          db,
          input.taskId,
          input.expectedRevision,
          revision,
          "采用已导入的真实产物",
        ),
      ),
    );
  }
  assetManage(input: unknown) {
    const a = z
      .object({
        projectId: idSchema,
        assetId: idSchema,
        expectedRevision: z.number().int(),
        name: nameSchema.optional(),
        tags: z.array(z.string().max(40)).max(30).optional(),
        archived: z.boolean().optional(),
      })
      .parse(input);
    return this.inProject(a.projectId, (db) =>
      transaction(db, () => {
        const asset = get<Asset>(db, "assets", a.assetId);
        cas(asset.revision, a.expectedRevision);
        if (a.name) asset.name = a.name;
        if (a.tags) asset.tags = a.tags;
        if (a.archived !== undefined) asset.archived = a.archived;
        asset.revision++;
        put(db, "assets", asset);
        return asset;
      }),
    );
  }
  canvasManage(input: unknown) {
    const a = z
      .object({
        projectId: idSchema,
        action: z.enum(["create", "update", "duplicate"]),
        canvasId: idSchema.optional(),
        name: nameSchema.optional(),
        archived: z.boolean().optional(),
        expectedRevision: z.number().int().optional(),
      })
      .parse(input);
    return this.inProject(a.projectId, (db) =>
      transaction(db, () => {
        if (a.action === "create")
          return this.createCanvas(db, nameSchema.parse(a.name));
        const c = get<Canvas>(db, "canvases", idSchema.parse(a.canvasId));
        if (a.action === "duplicate") {
          const copy = {
            ...c,
            id: uid("c"),
            name: a.name || `${c.name} 副本`,
            instances: [],
            nodes: c.nodes
              .filter((n) => n.type !== "workflow" && n.type !== "generation")
              .map((n) => ({ ...n, id: uid("n") })),
            edges: [],
            graphRevision: 0,
            layoutRevision: 0,
            updatedAt: now(),
          };
          put(db, "canvases", copy);
          return copy;
        }
        cas(c.graphRevision, z.number().int().parse(a.expectedRevision));
        if (a.name) c.name = a.name;
        if (a.archived !== undefined) c.archived = a.archived;
        c.graphRevision++;
        c.updatedAt = now();
        put(db, "canvases", c);
        return c;
      }),
    );
  }
  canvasPatch(input: unknown) {
    const a = z
      .object({
        projectId: idSchema,
        canvasId: idSchema,
        target: z.enum(["graph", "layout"]),
        expectedRevision: z.number().int().nonnegative(),
        ops: z.array(z.unknown()).max(1000),
      })
      .parse(input);
    return this.inProject(a.projectId, (db) =>
      transaction(db, () => {
        const c = get<Canvas>(db, "canvases", a.canvasId);
        cas(
          a.target === "graph" ? c.graphRevision : c.layoutRevision,
          a.expectedRevision,
        );
        for (const raw of a.ops) {
          const op = z.object({ op: z.string() }).passthrough().parse(raw);
          if (a.target === "layout") {
            if (op.op === "move") {
              const v = z.object({ id: idSchema, position }).parse(raw);
              const n = c.nodes.find((n) => n.id === v.id);
              if (!n) fail("节点不存在", 409);
              n!.position = v.position;
            } else if (op.op === "viewport")
              c.viewport = z
                .object({
                  x: z.number().finite(),
                  y: z.number().finite(),
                  zoom: z.number().min(0.1).max(4),
                })
                .parse(op.viewport);
            else fail("布局操作仅支持 move 和 viewport");
          } else {
            if (op.op === "add") {
              const n = nodeSchema.parse(op.node) as StudioNode;
              if (c.nodes.some((x) => x.id === n.id)) fail("节点身份重复");
              if (n.type === "generation")
                fail("请使用 generation_create 创建生成任务");
              if (n.type === "workflow")
                fail("请使用 instantiate 操作创建制作分组");
              if (n.type === "asset") {
                const r = get<AssetRevision>(
                  db,
                  "revisions",
                  idSchema.parse(n.data.revisionId),
                );
                if (r.assetId !== n.data.assetId) fail("资源与版本不匹配");
              }
              c.nodes.push(n);
            } else if (op.op === "remove") {
              const id = idSchema.parse(op.id);
              if (c.nodes.find((n) => n.id === id)?.type === "workflow")
                fail("制作分组请保留以追溯运行历史");
              c.nodes = c.nodes.filter((n) => n.id !== id);
              c.edges = c.edges.filter(
                (e) => e.source !== id && e.target !== id,
              );
            } else if (op.op === "note") {
              const id = idSchema.parse(op.id);
              const n = c.nodes.find((n) => n.id === id && n.type === "note");
              if (!n) fail("便签不存在");
              n!.data.text = z.string().max(30000).parse(op.text);
            } else if (op.op === "connect") {
              const e = edgeSchema.parse(op.edge);
              const error = canvasConnectionError(c, e.source, e.target);
              if (error) fail(error);
              if (c.edges.some((x) => x.id === e.id)) fail("连线重复");
              c.edges.push(e);
            } else if (op.op === "disconnect")
              c.edges = c.edges.filter((e) => e.id !== idSchema.parse(op.id));
            else if (op.op === "instantiate") {
              const inputNodeIds = z
                .array(idSchema)
                .max(20)
                .parse(op.inputNodeIds || []);
              const inputRevisionIds = z
                .array(idSchema)
                .max(20)
                .parse(op.inputRevisionIds || []);
              if (!inputNodeIds.length && !inputRevisionIds.length)
                fail("请指定制作输入节点或资产版本");
              for (const id of inputRevisionIds)
                get<AssetRevision>(db, "revisions", id);
              for (const id of inputNodeIds)
                if (!c.nodes.some((n) => n.id === id && n.type !== "workflow"))
                  fail("制作输入节点不存在或类型无效");
              const sources = [
                ...new Set([
                  ...inputNodeIds,
                  ...inputRevisionIds.flatMap((id) => {
                    const n = c.nodes.find(
                      (n) => n.type === "asset" && n.data.revisionId === id,
                    );
                    return n ? [n.id] : [];
                  }),
                ]),
              ];
              const inst = {
                id: uid("wf"),
                name: "角色制作",
                templateVersion,
                inputRevisionIds: inputRevisionIds.filter(
                  (id) =>
                    !sources.some(
                      (source) =>
                        c.nodes.find((n) => n.id === source)?.data
                          .revisionId === id,
                    ),
                ),
              };
              c.instances.push(inst);
              const nodeId = uid("n");
              c.nodes.push({
                id: nodeId,
                type: "workflow",
                position: position.parse(op.position),
                data: { title: "角色制作", instanceId: inst.id },
              });
              for (const source of sources)
                c.edges.push({
                  id: uid("e"),
                  source,
                  target: nodeId,
                  kind: "reference",
                });
            } else fail("未知画布操作");
          }
        }
        if (a.target === "graph") c.graphRevision++;
        else c.layoutRevision++;
        c.updatedAt = now();
        put(db, "canvases", c);
        event(db, "canvas.patched", { canvasId: c.id, target: a.target });
        return c;
      }),
    );
  }
  private resolveInputs(c: Canvas, ids: string[], assets: Asset[]) {
    try {
      return resolveCanvasInputs(c, ids, assets);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }
  private freezeInputs(snapshot: CanvasInputSnapshot, p: Project) {
    const frozen = structuredClone(snapshot);
    for (const item of frozen.items) {
      const texts: string[] = [];
      for (const f of item.files || []) {
        const filename = path.join(p.root, f.relativePath);
        if (!existsSync(filename)) fail(`输入文件丢失：${f.name}`, 404);
        const bytes = readFileSync(within(p.root, filename));
        if (createHash("sha256").update(bytes).digest("hex") !== f.sha256)
          fail(`输入文件已被修改，请重新导入：${f.name}`, 409);
        if (item.role === "prompt" && f.mime === "text/plain") {
          const text = bytes.toString("utf8");
          texts.push(`### ${f.name}\n${text.slice(0, 30000)}`);
          if (text.length > 30000) item.textTruncated = true;
        }
      }
      if (item.type === "asset" && texts.length) item.text = texts.join("\n\n");
    }
    frozen.prompt = canvasInputPrompt(frozen.items);
    return frozen;
  }
  prepare(input: unknown) {
    const a = z
      .object({ projectId: idSchema, canvasId: idSchema, instanceId: idSchema })
      .parse(input);
    return this.inProject(a.projectId, (db, p) =>
      transaction(db, () => {
        const c = get<Canvas>(db, "canvases", a.canvasId);
        const i = c.instances.find((i) => i.id === a.instanceId);
        if (!i) fail("制作分组不存在");
        const node = c.nodes.find(
          (n) => n.type === "workflow" && n.data.instanceId === i!.id,
        );
        if (!node) fail("制作分组节点不存在");
        const inputSnapshot = this.freezeInputs(
          this.resolveInputs(c, [node.id], inputAssets(db)),
          p,
        );
        if (!inputSnapshot.items.length)
          fail("制作分组没有输入，请先连接素材或便签");
        const plan = {
          id: uid("plan"),
          ...a,
          graphRevision: c.graphRevision,
          inputRevisionIds: inputSnapshot.revisionIds,
          inputSnapshot,
          templateVersion,
          createdAt: now(),
          executionMode: "manual_import",
          providerAvailable: false,
          cost: {
            status: "not_applicable",
            estimate: null,
            reason: "当前路线使用 Codex 与人工导入，不提交模型服务请求。",
          },
        };
        put(db, "plans", plan);
        return plan;
      }),
    );
  }
  start(input: unknown) {
    const a = z
      .object({
        projectId: idSchema,
        planId: idSchema,
        expectedRevision: z.number().int(),
        idempotencyKey: z.string().min(8).max(160),
      })
      .parse(input);
    return this.inProject(a.projectId, (db, p) =>
      transaction(db, () => {
        const operationId = `start:${a.idempotencyKey}`;
        const prior = db
          .prepare("SELECT data FROM operations WHERE id=?")
          .get(operationId) as { data: string } | undefined;
        if (prior) {
          const op = JSON.parse(prior.data);
          if (op.planId !== a.planId) fail("幂等键已用于不同计划", 409);
          return get<WorkflowRun>(db, "runs", op.runId);
        }
        const plan = get<{
          id: string;
          canvasId: string;
          instanceId: string;
          graphRevision: number;
          inputRevisionIds: string[];
          inputSnapshot?: CanvasInputSnapshot;
        }>(db, "plans", a.planId);
        const c = get<Canvas>(db, "canvases", plan.canvasId);
        cas(c.graphRevision, a.expectedRevision);
        cas(c.graphRevision, plan.graphRevision);
        const node = c.nodes.find((n) => n.data.instanceId === plan.instanceId);
        if (!node) fail("制作分组节点不存在");
        const inputSnapshot = this.freezeInputs(
          plan.inputSnapshot ||
            this.resolveInputs(c, [node.id], inputAssets(db)),
          p,
        );
        if (
          rows<WorkflowRun>(db, "runs").some(
            (r) => r.instanceId === plan.instanceId && r.status === "active",
          )
        )
          fail("该制作分组已有活动运行，请继续已有运行", 409);
        const run: WorkflowRun = {
          id: uid("run"),
          projectId: a.projectId,
          canvasId: c.id,
          instanceId: plan.instanceId,
          templateVersion,
          graphRevision: c.graphRevision,
          inputRevisionIds: [...inputSnapshot.revisionIds],
          inputSnapshot,
          steps: phases.map((s, index) => ({
            ...s,
            status: index === 0 ? "awaiting_agent" : "pending",
            inputRevisionIds: index === 0 ? [...inputSnapshot.revisionIds] : [],
            outputRevisionIds: [],
            stale: false,
          })),
          status: "active",
          revision: 0,
          createdAt: now(),
          updatedAt: now(),
          cost: {
            status: "not_applicable",
            estimate: null,
            reason: "人工导入路线；没有向模型服务发送请求",
          },
        };
        put(db, "runs", run);
        put(db, "operations", {
          id: operationId,
          runId: run.id,
          planId: a.planId,
        });
        event(db, "workflow.started", { runId: run.id });
        return run;
      }),
    );
  }
  private advance(run: WorkflowRun, index: number) {
    const next = run.steps[index + 1];
    if (next) {
      next.inputRevisionIds = [...run.steps[index].outputRevisionIds];
      next.status =
        next.mode === "review"
          ? "awaiting_review"
          : next.mode === "agent"
            ? "awaiting_agent"
            : "awaiting_manual";
    } else run.status = "succeeded";
    run.revision++;
    run.updatedAt = now();
  }
  submit(input: unknown) {
    const a = z
      .object({
        projectId: idSchema,
        runId: idSchema,
        stepKey: idSchema,
        revisionIds: z.array(idSchema).min(1).max(10),
        expectedRevision: z.number().int(),
      })
      .parse(input);
    return this.inProject(a.projectId, (db) =>
      transaction(db, () => {
        const r = get<WorkflowRun>(db, "runs", a.runId);
        cas(r.revision, a.expectedRevision);
        if (r.status !== "active") fail("此运行已结束");
        const index = r.steps.findIndex((s) => s.key === a.stepKey);
        const step = r.steps[index];
        if (
          !step ||
          !["awaiting_manual", "awaiting_agent"].includes(step.status) ||
          step.mode === "local"
        )
          fail("此阶段不能提交人工成果");
        const revs = a.revisionIds.map((id) =>
          get<AssetRevision>(db, "revisions", id),
        );
        const files = revs.flatMap((r) => r.files);
        if (step.key === "brief" && !files.some((f) => f.mime === "text/plain"))
          fail("角色目标阶段需要 Brief 文档");
        if (
          step.key === "reference" &&
          !files.some((f) => f.mime.startsWith("image/"))
        )
          fail("参考阶段需要图片");
        if (
          ["candidate", "assembly", "rig"].includes(step.key) &&
          !revs.every((r) => r.files.some((f) => f.role === "runtime"))
        )
          fail("每个模型候选都需要 GLB");
        if (
          ["assembly", "rig"].includes(step.key) &&
          !revs.every(
            (r) =>
              r.files.some((f) => f.name.endsWith(".blend")) &&
              r.files.some((f) => f.name.endsWith(".glb")),
          )
        )
          fail("请将同次制作的 Blend 与 GLB 作为同一个资源版本文件集导入");
        step.outputRevisionIds = a.revisionIds;
        step.status = "succeeded";
        step.stale = false;
        this.advance(r, index);
        put(db, "runs", r);
        event(db, "workflow.artifact_submitted", {
          runId: r.id,
          stepKey: step.key,
          revisionIds: a.revisionIds,
        });
        return r;
      }),
    );
  }
  decide(input: unknown) {
    const a = z
      .object({
        projectId: idSchema,
        runId: idSchema,
        stepKey: z.enum(["appearance", "deformation"]),
        revisionId: idSchema,
        expectedRevision: z.number().int(),
        decision: z.enum(["accept", "request_changes"]),
        comment: z.string().max(5000).default(""),
        actor: z.enum(["user", "delegated_agent"]).default("user"),
      })
      .parse(input);
    return this.inProject(a.projectId, (db) =>
      transaction(db, () => {
        const run = get<WorkflowRun>(db, "runs", a.runId);
        cas(run.revision, a.expectedRevision);
        if (run.status !== "active") fail("此运行已结束");
        const index = run.steps.findIndex((s) => s.key === a.stepKey);
        const s = run.steps[index];
        if (
          s.status !== "awaiting_review" ||
          !s.inputRevisionIds.includes(a.revisionId)
        )
          fail("审核输入已变化，请刷新候选", 409);
        if (a.decision === "request_changes" && !a.comment.trim())
          fail("返修需要具体描述");
        const d: ReviewDecision = {
          id: uid("review"),
          runId: run.id,
          stepKey: a.stepKey,
          inputRevisionIds: [...s.inputRevisionIds],
          outputRevisionIds: [a.revisionId],
          scope: a.stepKey === "appearance" ? "appearance" : "deformation",
          decision: a.decision,
          actor: a.actor,
          comment: a.comment,
          createdAt: now(),
        };
        put(db, "reviews", d);
        if (a.decision === "accept") {
          s.outputRevisionIds = [a.revisionId];
          s.status = "succeeded";
          s.stale = false;
          this.advance(run, index);
        } else {
          const prev = run.steps[index - 1];
          prev.status = "awaiting_manual";
          prev.stale = true;
          s.status = "pending";
          s.stale = true;
          run.revision++;
          run.updatedAt = now();
        }
        put(db, "runs", run);
        event(db, "workflow.reviewed", { reviewId: d.id, runId: run.id });
        return run;
      }),
    );
  }
  rerun(input: unknown) {
    const a = z
      .object({
        projectId: idSchema,
        runId: idSchema,
        fromStep: idSchema,
        expectedRevision: z.number().int(),
        inputRevisionIds: z.array(idSchema).min(1).optional(),
        idempotencyKey: z.string().min(8).max(160),
      })
      .parse(input);
    return this.inProject(a.projectId, (db, p) =>
      transaction(db, () => {
        const key = `rerun:${a.idempotencyKey}`;
        const prior = db
          .prepare("SELECT data FROM operations WHERE id=?")
          .get(key) as { data: string } | undefined;
        if (prior) {
          const op = JSON.parse(prior.data);
          if (
            op.parentRunId !== a.runId ||
            op.fromStep !== a.fromStep ||
            json(op.inputRevisionIds) !== json(a.inputRevisionIds)
          )
            fail("幂等键已用于不同返修请求", 409);
          return get<WorkflowRun>(db, "runs", op.runId);
        }
        const old = get<WorkflowRun>(db, "runs", a.runId);
        cas(old.revision, a.expectedRevision);
        const index = old.steps.findIndex((s) => s.key === a.fromStep);
        if (index < 0 || ["review", "local"].includes(old.steps[index].mode))
          fail("请选择产出阶段重新运行");
        if (
          old.steps
            .slice(0, index)
            .some((s) => s.status !== "succeeded" || s.stale)
        )
          fail("前置阶段尚未完成");
        if (a.inputRevisionIds)
          for (const id of a.inputRevisionIds)
            get<AssetRevision>(db, "revisions", id);
        const r: WorkflowRun = structuredClone(old);
        r.id = uid("run");
        r.parentRunId = old.id;
        r.revision = 0;
        r.status = "active";
        r.createdAt = r.updatedAt = now();
        for (let i = index; i < r.steps.length; i++) {
          r.steps[i].stale = true;
          r.steps[i].status =
            i === index
              ? r.steps[i].mode === "agent"
                ? "awaiting_agent"
                : "awaiting_manual"
              : "pending";
          r.steps[i].outputRevisionIds = [];
          if (i > index) r.steps[i].inputRevisionIds = [];
        }
        if (a.inputRevisionIds) {
          r.steps[index].inputRevisionIds = a.inputRevisionIds;
          if (index === 0) {
            r.inputRevisionIds = [...new Set(a.inputRevisionIds)];
            const c = get<Canvas>(db, "canvases", old.canvasId);
            // Preserve frozen notes; explicit rerun inputs replace the asset set.
            const replaced = this.resolveInputs(
              {
                ...c,
                nodes: [
                  {
                    id: "rerun-inputs",
                    type: "workflow",
                    position: { x: 0, y: 0 },
                    data: { title: "返修输入", instanceId: "rerun-inputs" },
                  },
                ],
                edges: [],
                instances: [
                  {
                    id: "rerun-inputs",
                    name: "返修输入",
                    templateVersion,
                    inputRevisionIds: r.inputRevisionIds,
                  },
                ],
              },
              ["rerun-inputs"],
              inputAssets(db),
            );
            replaced.graphRevision =
              old.inputSnapshot?.graphRevision ?? old.graphRevision;
            replaced.targetNodeIds = old.inputSnapshot?.targetNodeIds || [];
            replaced.items.unshift(
              ...(old.inputSnapshot?.items.filter((i) => i.type === "note") ||
                []),
            );
            r.inputSnapshot = this.freezeInputs(replaced, p);
          }
        }
        if (old.status === "active") {
          old.status = "cancelled";
          old.revision++;
          old.updatedAt = now();
          put(db, "runs", old);
        }
        put(db, "runs", r);
        put(db, "operations", {
          id: key,
          runId: r.id,
          parentRunId: a.runId,
          fromStep: a.fromStep,
          inputRevisionIds: a.inputRevisionIds,
        });
        event(db, "workflow.rerun", {
          parentRunId: old.id,
          runId: r.id,
          fromStep: a.fromStep,
        });
        return r;
      }),
    );
  }
  cancel(projectId: string, runId: string, expectedRevision: number) {
    return this.inProject(projectId, (db) =>
      transaction(db, () => {
        const r = get<WorkflowRun>(db, "runs", runId);
        cas(r.revision, expectedRevision);
        if (r.status === "active") {
          r.status = "cancelled";
          for (const s of r.steps)
            if (s.status !== "succeeded") s.status = "cancelled";
          r.revision++;
          r.updatedAt = now();
          put(db, "runs", r);
        }
        return r;
      }),
    );
  }
  assetFile(projectId: string, revisionId: string, index: number) {
    return this.inProject(projectId, (db, p) => {
      const r = get<AssetRevision>(db, "revisions", revisionId);
      const f = r.files[index];
      if (!f) fail("文件不存在", 404);
      const file = path.join(p.root, f.relativePath);
      if (!existsSync(file)) fail("资源文件丢失，请重新导入", 404);
      const resolved = within(p.root, file);
      return { file: resolved, metadata: f };
    });
  }
  exportBundle(input: unknown) {
    const a = z
      .object({
        projectId: idSchema,
        revisionIds: z.array(idSchema).min(1).max(100),
        runId: idSchema.optional(),
        expectedRevision: z.number().int().optional(),
        idempotencyKey: z.string().min(8).max(160),
      })
      .parse(input);
    return this.inProject(a.projectId, (db, p) =>
      transaction(db, () => {
        const key = `export:${a.idempotencyKey}`;
        const prev = db
          .prepare("SELECT data FROM operations WHERE id=?")
          .get(key) as { data: string } | undefined;
        if (prev) {
          const op = JSON.parse(prev.data);
          if (
            json(op.revisionIds) !== json(a.revisionIds) ||
            op.runId !== a.runId
          )
            fail("幂等键已用于不同导出", 409);
          return get<ExportBundle>(db, "exports", op.bundleId);
        }
        const run = a.runId ? get<WorkflowRun>(db, "runs", a.runId) : undefined;
        if (run) {
          cas(run.revision, z.number().int().parse(a.expectedRevision));
          if (
            run.status !== "active" ||
            run.steps[7].status !== "awaiting_manual" ||
            json(a.revisionIds) !== json(run.steps[7].inputRevisionIds)
          )
            fail("导出版本必须与已审核的交接输入一致", 409);
        }
        const revisions = a.revisionIds.map((id) =>
          get<AssetRevision>(db, "revisions", id),
        );
        const id = uid("export");
        const base = safeDir(
          p.root,
          path.join(p.root, ".game-studio", "exports"),
        );
        const stage = safeDir(
          p.root,
          path.join(p.root, ".game-studio", "work", id),
        );
        const dest = path.join(base, id);
        const records = revisions.map((r) => ({
          ...r,
          files: r.files.map((f, index) => {
            const { file } = this.assetFile(a.projectId, r.id, index);
            const bytes = readFileSync(file);
            if (createHash("sha256").update(bytes).digest("hex") !== f.sha256)
              fail(`资源文件已改变：${f.name}`, 409);
            const rel = path.join(r.assetId, r.id, f.name);
            mkdirSync(path.dirname(path.join(stage, rel)), { recursive: true });
            copyFileSync(file, path.join(stage, rel));
            return { ...f, bundlePath: rel };
          }),
        }));
        const visual = run ? ("passed" as const) : ("not_verified" as const);
        const bundle: ExportBundle = {
          id,
          runId: run?.id,
          revisionIds: a.revisionIds,
          path: dest,
          createdAt: now(),
          validation: { technical: "passed", engine: "not_verified", visual },
        };
        writeFileSync(
          path.join(stage, "manifest.json"),
          json({
            schemaVersion: 1,
            bundle,
            projectId: p.id,
            engine: p.engine,
            technicalScope:
              "文件完整性与导入格式结构；未检查网格预算、骨架或 Blend 可编辑性",
            engineEvidence: [],
            visualScope: run
              ? "用户已记录变形审核；不是自动视觉或引擎测试"
              : "未记录视觉审核",
            assets: records,
            reviews: rows<ReviewDecision>(db, "reviews").filter(
              (d) => d.runId === run?.id,
            ),
          }),
        );
        renameSync(stage, dest);
        put(db, "exports", bundle);
        put(db, "operations", {
          id: key,
          bundleId: id,
          revisionIds: a.revisionIds,
          runId: a.runId,
        });
        if (run) {
          run.steps[7].status = "succeeded";
          run.steps[7].outputRevisionIds = a.revisionIds;
          run.steps[7].stale = false;
          this.advance(run, 7);
          put(db, "runs", run);
        }
        event(db, "bundle.exported", { bundleId: id });
        return bundle;
      }),
    );
  }
  context(projectId: string, canvasId: string, nodeIds: string[]) {
    const s = this.snapshot(projectId);
    const c = s.canvases.find((c) => c.id === canvasId);
    if (!c) fail("画布不存在", 404);
    const nodes = c!.nodes.filter((n) => nodeIds.includes(n.id));
    if (nodes.length !== new Set(nodeIds).size) fail("选择集中有不存在的节点");
    const inputSnapshot = this.inProject(projectId, (_db, p) =>
      this.freezeInputs(this.resolveInputs(c!, nodeIds, s.assets), p),
    );
    return {
      schemaVersion: 1,
      project: {
        id: s.project.id,
        name: s.project.name,
        engine: s.project.engine,
        root: s.project.root,
      },
      canvas: { id: c!.id, name: c!.name, graphRevision: c!.graphRevision },
      selection: nodes.map((n) => ({ nodeId: n.id, ...n.data })),
      inputSnapshot,
      revisions: s.assets
        .flatMap((a) => a.revisions)
        .filter((r) => inputSnapshot.revisionIds.includes(r.id))
        .map((r) => ({
          id: r.id,
          assetId: r.assetId,
          files: r.files.map((f) => ({
            name: f.name,
            relativePath: f.relativePath,
            fileRef: path.join(s.project.root, f.relativePath),
            sha256: f.sha256,
          })),
        })),
      runs: s.runs.filter((r) =>
        nodes.some((n) => n.data.instanceId === r.instanceId),
      ),
    };
  }
  runInputs(projectId: string, run: WorkflowRun) {
    const s = this.snapshot(projectId);
    const next = run.steps.find((step) => step.status.startsWith("awaiting_"));
    const filesFor = (ids: string[]) =>
      s.assets.flatMap((asset) =>
        asset.revisions
          .filter((r) => ids.includes(r.id))
          .flatMap((r) =>
            r.files.map((f, fileIndex) => ({
              ...f,
              assetId: asset.id,
              assetName: asset.name,
              revisionId: r.id,
              version: r.number,
              fileIndex,
              fileRef: path.join(s.project.root, f.relativePath),
            })),
          ),
      );
    return {
      projectRoot: s.project.root,
      prompt: run.inputSnapshot?.prompt || "",
      notes: run.inputSnapshot?.items.filter((i) => i.type === "note") || [],
      referenceFiles: filesFor(run.inputRevisionIds),
      stepInputFiles: filesFor(next?.inputRevisionIds || []),
    };
  }
}
