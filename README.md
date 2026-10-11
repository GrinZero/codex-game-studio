# Open Game Studio

对外名称为 Open Game Studio。为兼容已有安装，插件 ID `game-studio`、包名 `codex-game-studio`、MCP 资源 URI 和数据目录沿用原值。

本地游戏制作工作台的首轮 Alpha。基于《Codex 游戏工作台产品与技术设计 v0.1》开始实现，项目、资源、自由画布和角色制作记录共用一个 Studio Core。

## 安装到本机 Codex（macOS）

当前版本为 **v0.1.7**，新建项目默认直接使用选中的文件夹，可选按项目名称创建子文件夹，并显示最终项目路径。发布更新时同步提升 `package.json`、`package-lock.json`、`plugin.json` 和 MCP 服务/UI 的版本，再运行安装器，以便 Codex 识别新版本缓存。

需要 Node.js 24+ 和提供 `codex plugin` 命令的 Codex CLI：

```sh
npm run install:local
npm run demo
```

安装器构建生产 UI，将运行时与依赖复制到 `~/.local/share/codex-integrations/game-studio-local/runtime`，通过本地插件市场安装并启用 `game-studio@game-studio-local`。9 个技能、18 个领域工具及 1 个界面专用桥接工具随插件加载，运行时不依赖开发仓库或插件缓存中的依赖安装。

在 Codex 侧边栏「…」菜单中选择 **Open Game Studio**，或在新聊天输入「打开 Open Game Studio 工作台」。插件 v0.1.1 注册了全局侧边栏和聊天内嵌入口；更新后如果菜单仍未出现，退出并重新打开 Codex，让宿主重新发现入口。内嵌 UI 通过 MCP 读取数据、传输媒体和导入文件，不依赖沙箱访问 localhost。

备用浏览器工作台由用户级 macOS LaunchAgent 在后台运行并随登录启动，地址为 http://127.0.0.1:4310。HTTP 与 MCP 共用 `~/.game-studio`；安装时可用 `STUDIO_HOME` 和 `PORT` 同时指定两者。

可重复运行安装器更新本地副本。停用后台工作台：`launchctl bootout gui/$(id -u)/local.codex.game-studio`；重新启动：`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.codex.game-studio.plist`。卸载插件用 `codex plugin remove game-studio@game-studio-local`；如需取消登录启动，再移除上述 LaunchAgent plist。项目和登记库单独保留。

## 运行

需要 Node.js 24+，项目使用 Node 内置 SQLite。

```sh
npm ci
npm run build
npm start
```

打开 http://127.0.0.1:4310。开发模式使用 `npm run dev`。界面、HTTP 和 MCP 的默认项目登记库为 `~/.game-studio/registry.db`；`STUDIO_HOME` 可指定另一绝对目录，UI 与 MCP 必须保持一致。`PORT` 可改变工作台端口。HTTP 只监听 127.0.0.1，并校验 Host 与浏览器 Origin。

体验有实际资源与跨画布引用的示例：

```sh
npm run demo
```

示例在仓库 `var/demo/star-maker` 中创建「星铸者 · 示例」，使用原创插画与文档，不进行生成、自动审核或引擎验收。创建动作可重复运行，不重复创建资源。

## 已实现

- 项目创建、已有目录登记、名称、目标引擎、可选项目集、归档与目录重定位。原目录不重排；重定位需要原项目身份。
- macOS 原生文件夹选择：新建项目默认直接使用选中的文件夹并保留已有文件，可选按项目名称创建子文件夹；关联项目直接选择已有目录。浏览器和 Codex 内嵌工作台共用此入口，保留手动修改路径。取消选择保留表单；其他系统可手动输入。
- 项目封面：项目卡片和项目设置可从已导入图片中选择、上传新图片、更换或移除封面；图片资源详情可直接设为封面。支持 PNG、JPG、WebP、GIF，上传图片同时登记到资源库。封面绑定固定版本与文件索引，刷新、重启和目录重定位后保留；移除封面保留资源文件。
- 资源上传或项目内文件导入；多文件版本集、SHA256、来源、不可变历史、检索与引用位置。新版本不会自动替换画布或流程选择。
- 多画布、固定版本引用、便签、真实输入连线、选择与框选、拖动、缩放和平移、视口保存、布局撤销/重做。删除资源节点保留底层资产。
- 画布右键菜单：空白处添加便签、导入到点击位置、打开资源栏、粘贴和布局撤销/重做；节点查看、便签编辑、固定版本主文件下载、上下文复制、多选副本和移除引用；连线可直接断开。复制在当前工作台会话的同一项目画布之间可用，保留固定版本、相对位置与所选节点内部连线。制作分组保留独立运行历史，以新建方式展开。
- 连线递归收集上游文档、便签与固定资产版本；创建制作分组自动连接所选素材。开始前展示输入清单和文字，确认后冻结到计划与运行；断线影响后续准备，既有运行与历史保持。循环、重复连接和未明确产出的制作分组输出被拒绝。`selection_context` 包含上游输入，`workflow_get` 返回冻结文字和实际文件路径。当前仍使用 Codex / 人工制作路线，不会因接线自动调用模型服务。
- 固定整体角色模板：目标 → 参考 → 候选 → 外形审核 → 组装 → 绑定 → 变形审核 → 导出。Agent 与人工阶段接续，审核绑定明确版本。点击预览不写采用记录。
- SQLite 持久 Run、幂等启动与导出、保存的审核和返修、从产出阶段局部重跑，前置成果与旧 Run 保留。
- 固定版本导出目录与 manifest；按 hash 验证文件完整性。技术检查的范围是导入格式结构与文件完整性，实际 Blend 可编辑性、网格/骨架质量和 Godot 验收不被标记通过。
- 18 个领域 MCP 工具、1 个界面专用桥接工具；Codex 侧边栏/聊天内嵌工作台；9 个原创工作流 Skills。
- 画布内 GLB 实时预览与自动旋转；详情支持旋转、缩放、动画播放与切换，并显示加载进度和错误。画布固定版本引用，屏幕外暂停渲染；查看器懒加载。图片、文档、基础音视频预览。SVG 与外部依赖 glTF 暂不导入。

## 仍待完成

当前实现是基础工作台和人工制作路线，**不是完整 MVP**。

真实模型 Provider、付费 Job 提交/查询/恢复、独立头身分支、Blender/Godot worker、预算与骨架检查、完整语义撤销/重做、自由分组、自动扫描已有游戏目录、ohmygame 迁移、数据库备份，以及模型上下文消息与文件入口仍需下一阶段验证。内嵌入口返回 `registered`；已验证 SDK 沙箱，实际 Codex 原生菜单仍需用户观察。模型服务未接入，导出的引擎验收为 `not_verified`。

预览模型和格式结构校验不证明模型可用。测试中的最小 GLB 与 Blend 文件头是契约测试夹具，不是可编辑角色、动画或实际引擎证据。

## Codex / MCP

```sh
npm run mcp
```

这是 stdio 服务，不向 stdout 写运行日志。`studio_open` 提供浏览器 URL 与项目快照；先在单独本地进程运行 UI。`plugin.json`、`mcp.json` 与 `skills/` 是便携开发包；`npm run install:local` 转换为当前 Codex 的本地市场、`.codex-plugin/plugin.json` 与 `.mcp.json` 布局。macOS 安装、启用、缓存配置真实 stdio 握手和生产 UI 已验证，见 `docs/VERIFICATION.md`。

直接 MCP 配置示例（把路径替换为本机仓库路径）：

```toml
[mcp_servers.game-studio]
command = "node"
args = ["/absolute/path/codex-game-studio/node_modules/tsx/dist/cli.mjs", "/absolute/path/codex-game-studio/src/server/mcp.ts"]
```

操作契约见 `docs/TOOL_CONTRACT.md`，交付状态与下一轮任务见 `docs/IMPLEMENTATION.md`。

## 检查

工作台首页与项目页的顶部导航旁显示 `v0.1.7-YYYYMMDDHHmmss` 小标识。每次 `npm run build` 从 `package.json` 读取版本，并以台北时区生成固定构建时间戳，HTTP 与 MCP 内嵌工作台共用该标识。执行 `npm run check:distribution` 检查两份产物一致；更新后通过 `node scripts/sync-runtime.mjs` 同步运行目录，并刷新用户实际打开的工作台验证显示。

```sh
npm run check
npm test
npm run build
```

真实浏览器冒烟另启一个隔离登记库的服务，再运行脚本：

```sh
STUDIO_HOME=/absolute/path/browser-test-registry PORT=4311 npm run dev
# 另一个终端，已有 Playwright Chromium 时执行
npm run test:ui
```

浏览器脚本会创建一个隔离服务中的验收项目并保留诊断图片在 `var/qa`。如果本机没有 Chromium，先运行 `npx playwright install chromium`。自动测试涵盖真实 stdio 握手、跨画布引用、CAS、重启状态、幂等、审核绑定、局部重跑、导出、路径边界与文件篡改。

## 目录

```text
src/server/       Core、HTTP、stdio MCP 与共享操作
src/shared/       领域类型
src/ui/           React、React Flow 与懒加载 GLB 预览
skills/           设置与制作技能
samples/          原创示例插画与 Brief
templates/        角色模板说明
tests/            领域与真实 MCP 测试
scripts/          示例项目与浏览器验收
docs/             实施状态、契约与后续计划
```

项目登记只保存目录；每个项目的权威元数据位于 `.game-studio/studio.db`，版本文件在 `.game-studio/assets/<assetId>/<revisionId>/`，导出在 `.game-studio/exports/`。JSON 仅是快照/导出，不作为第二事实源。

当前开发包尚未选择对外开源许可证；依赖许可与原创来源记录见 `licenses/THIRD_PARTY.md`。未捆绑 Charakuru 或 UniMate 的代码、技能、权重或角色素材。

### 统一资源添加菜单

画布顶部「添加资源」、左下角「＋」和空白处右键均可进入统一菜单：新建文档、引用已有文档、文本、图片、视频、3D 模型、3D 动画、音频、源文件、上传和资源库。

文档支持 Markdown 编辑与预览，保存为不可变新版本，仅更新当前画布节点。资源库可选择已有资源的明确版本复用。文档与音视频支持画布预览；文档双击编辑，制作节点双击查看任务。

图片／视频／模型／动画／音频使用持久任务，通过本机 Codex 及已配置生成工具制作，完成后验证入库并回填节点。设置与参考版本冻结，运行记录可查看历史，刷新不会重提。动画需模型输入，GLB 产物须含骨架和动作。缺少制作工具、认证或提交确认时明确保留失败原因；不会用占位素材冒充成功。生成服务的真实付费调用需要对应工具的账号与确认，不属于免费本地能力。可用 `STUDIO_CODEX_BIN` 指定 Codex 执行器。当前尚无内置 Provider 密钥管理与完整费用面板。

导入补充 WebM、OGG、M4A 与常见代码源文件。GLB、图片、Markdown、MP4、音频和 Blend 的既有版本流程保持兼容。
