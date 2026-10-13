# Workbench guide

[README](../README.md) · [Setup](SETUP.md) · [Tool contract](TOOL_CONTRACT.md)

## Projects and covers

Create a project in a chosen folder or register an existing folder. New projects use the selected folder directly unless you choose to create a subfolder named after the project. Existing files remain in place. macOS supports native folder selection; elsewhere, type the path. Canceling folder selection keeps the form.

Projects have names, target-engine metadata, optional collections and an archive state. Relocation requires the original project identity; changing an engine label does not validate the game in that engine. Select an imported image as a project cover or upload PNG, JPG, WebP or GIF. Covers pin the image revision and file index; removing a cover keeps the asset.

## Assets and versions

Upload files or import files already within the project boundary. A revision may contain multiple files and records hashes, source information and immutable history. Search assets by name, tags or type and inspect where each version is used.

Canvas references, reviews and exports select explicit versions. Importing a newer version does not update earlier selections. Deleting a canvas reference does not delete the underlying asset. The resource dock groups assets by purpose, such as characters, equipment, vegetation and buildings. You can override the inferred category in the asset details.

## Canvas editing

Each project can have multiple canvases with their own saved viewport. Drag nodes, box-select, zoom or pan. Layout undo/redo covers positions; full graph undo/redo is unfinished.

Drag PNG, JPG, WebP or GIF images from Codex conversation thumbnails or local files onto the canvas to import them and create pinned image nodes at the drop position. Up to 12 images (200 MB total) can be dropped at once; each becomes a separate resource and node. Image HTML/data URLs are also accepted when the host supplies them. URL-only drags that cannot be read show an error; save the image and drag the file instead. The workbench copies image bytes into the project, so refreshing keeps the nodes and their previews.

The toolbar's add-resource control, lower-left **+**, and blank-canvas context menu lead to the same resource menu. It supports new documents, existing document references, text notes, images, video, 3D models, 3D animations, audio, source files, uploads and the library. The library lets you choose a specific revision to reuse.

| Context          | Actions                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Blank canvas     | Add a note, import at the clicked position, open the resource dock, paste, undo/redo layout, select all and fit view  |
| Asset node       | Inspect, download its pinned main file, add conversation references, duplicate selected nodes or remove the reference |
| Note             | Rename, edit its name and text, copy or remove it                                                                     |
| Connection       | Disconnect the input                                                                                                  |
| Production group | Inspect or expand its own run history                                                                                 |

The node clipboard works across canvases in the same project and workbench session. It preserves pinned asset versions, relative positions and connections inside the selected set, using new node and edge IDs. Production groups are expanded as new groups rather than copied with executable history. Cross-project paste is unsupported.

## Documents and previews

Markdown documents support editing and preview. Saving creates an immutable revision and updates only the edited canvas node; other nodes remain pinned. Double-click a document to edit it, or a production node to inspect its task.

Images, documents, basic audio and video can preview on the canvas. The lazy-loaded GLB viewer provides rotation, zoom and animation selection, with progress and error states. Off-screen canvas previews pause rendering. Imported GLB must be self-contained; SVG and externally dependent glTF are unsupported. Accepted media also includes WebM, OGG, M4A and common source-code files. See the implementation's import validation for precise formats.

## Connections and frozen inputs

Connections recursively collect upstream notes, documents and explicit asset revisions. Creating a production group from selected material also connects its inputs. Before starting a character workflow, inspect the input list and text. Preparation freezes the graph version and inputs; graph changes invalidate the plan, while layout changes do not.

A started run retains its frozen inputs even when you later edit notes, disconnect edges or import newer versions. Cycles, duplicate connections and unselected production-group outputs are rejected. Connecting nodes does not submit a model request. `selection_context` includes upstream material, and `workflow_get` exposes frozen text and actual file paths.

## Asset production through Codex

Draft image, video, model, animation or audio tasks using a prompt, settings and references. Drafting does not submit generation. Starting invokes local Codex and the tools configured for that executor. Those tools supply their own capabilities, login requirements, parameters, cost rules and submission approval. The studio does not bundle a model provider, API-key manager or full cost panel.

Task settings and reference revisions freeze at creation. Tasks persist through refresh; repeated starts do not resubmit the same task. A successful result is checked and imported before replacing the task node with a pinned asset node. Animation requires a model input and GLB output containing both a skeleton and animation clips. This structural check does not establish animation quality.

Unavailable tools, missing authentication or required approval leave explicit reasons rather than fabricated results. Stopping cancels local execution but not remote work already submitted. Interrupted work can use a recovered result or an explicitly adopted imported revision; do not blindly resubmit unknown remote outcomes.

## Character production and delivery

The current template follows:

```text
Brief → Reference → Candidate → Appearance review
      → Assembly → Rig → Deformation review → Export
```

Agent and manual stages can hand off imported files. Reviews accept an explicit version or request changes with saved feedback. Previewing a candidate does not accept it. Runs and decisions are persistent; local partial reruns preserve earlier results and the old run. Independent head/body branches are not implemented.

Exports copy explicit revisions to a delivery directory with a manifest and file hashes. Exporting a workflow requires its current deformation review to accept the delivery inputs. File integrity and supported format structures are checked; editable Blend files, mesh budgets, rig deformation and Godot acceptance require separate real-tool validation. Engine validation remains `not_verified`.

## Conversation references

Select canvas nodes and use **添加引用** or the node menu’s **添加到对话引用…**. In a compatible Codex MCP App host, **添加引用** updates the model context for the next message without sending a message or starting a task. The workbench shows removable reference chips; removing or clearing them updates the host context. References keep pinned asset revisions, file paths, note snapshots and associated inputs. Documents are read from their pinned files as needed. Adding the same selection again refreshes its snapshot; different selections accumulate. References belong to the current open workbench view and are not stored as project data.

Browser windows and hosts that do not advertise text model-context updates offer **复制引用** as a fallback. Copying alone does not attach anything to a conversation. The workbench’s chips are separate from Codex’s native composer; native composer chips depend on host support.

节点支持自定义大小：选中任意资源、便签、制作分组或生成任务节点，拖动边框或四角；也可右键选择「设置节点大小」输入宽高，或恢复默认大小。宽度范围 160–4000，高度范围 120–4000，单位为画布像素。尺寸自动保存，重新打开画布、复制节点及复制画布保留尺寸，布局撤销/重做同时恢复大小和位置。
