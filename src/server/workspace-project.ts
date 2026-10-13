import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Project } from "../shared/types.js";

function directory(value: string) {
  try {
    const root = value.startsWith("file:") ? fileURLToPath(value) : value;
    if (!path.isAbsolute(root)) return;
    return realpathSync(root);
  } catch {
    return;
  }
}

/** A shared server's cwd is its install directory, never the chat workspace. */
export function workspaceProject(projects: Project[], roots: string[]) {
  const matches = new Set<string>();
  for (const value of roots) {
    const workspace = directory(value);
    if (!workspace) continue;
    const candidates = projects
      .filter((project) => !project.archived && project.available)
      .map((project) => ({ project, root: directory(project.root) }))
      .filter(({ root }) => {
        if (!root) return false;
        const relative = path.relative(root, workspace);
        return (
          relative === "" ||
          (!relative.startsWith(`..${path.sep}`) &&
            relative !== ".." &&
            !path.isAbsolute(relative))
        );
      })
      .sort((a, b) => b.root!.length - a.root!.length);
    if (candidates[0]) matches.add(candidates[0].project.id);
  }
  return matches.size === 1 ? [...matches][0] : undefined;
}
