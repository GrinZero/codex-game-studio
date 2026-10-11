---
name: canvas-authoring
description: Organize references, notes and production groups on an Open Game Studio canvas without launching generation.
---

Inputs: projectId, canvasId and the desired selected resource revisions. Read canvas_open and asset_inspect first.

Use canvas_patch graph with the current graphRevision for add/remove/note/connect/disconnect or instantiate operations. Asset nodes require matching assetId and immutable revisionId. Reference edges have kind=reference and bind upstream fixed asset revisions and notes as production inputs. They do not schedule generation. Input traversal is recursive, deduplicates revisions and rejects cycles, duplicate endpoints and workflow sources; use a specific output asset revision as a source. Workflow instances use the built-in character template. Instantiate with inputNodeIds to create visible input connections; inputRevisionIds without canvas nodes remain explicit fixed inputs.

Use canvas_patch layout with the current layoutRevision for move and viewport. These actions never change execution inputs. On CAS conflict read again and merge only the intended changes. Never overwrite the current whole canvas with a stale snapshot.

Verify nodes resolve to the intended versions. Removing a resource node preserves the asset. The UI currently offers layout undo/redo; semantic undo and persistent editor history remain future work.
