---
name: studio-project
description: Create, link, rename or restore a local Open Game Studio project and locate unfinished production.
---

Inputs are an intended project name, explicit directory or existing projectId. Use studio_open to list projects and resolve ambiguity. Do not choose among same-name projects by guesswork.

For create, pass an absolute new directory. For link, use an existing directory; registration adds `.game-studio` but does not reorganize original files. project_manage update changes name, engine, optional collection or archive status. Relocate requires a directory containing the exact existing project identity.

Read project_open after mutation and report actual path availability, canvases, pending runs and capability limits. Resume the existing run before creating a new one. Project archive never means deleting external files.
