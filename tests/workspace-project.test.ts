import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { StudioCore } from "../src/server/core.js";
import { dispatch } from "../src/server/operations.js";
import { workspaceProject } from "../src/server/workspace-project.js";

test("工作区匹配最近的登记目录，排除前缀碰撞、归档、失效与多项目歧义", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "studio-workspace-"));
  const core = new StudioCore(path.join(dir, "registry"));
  try {
    const parent = core.projectManage({
      action: "create",
      name: "主项目",
      root: path.join(dir, "game"),
    });
    const nested = core.projectManage({
      action: "create",
      name: "子项目",
      root: path.join(parent.root, "child"),
    });
    const sub = path.join(nested.root, "assets");
    mkdirSync(sub);
    const alias = path.join(dir, "alias");
    symlinkSync(nested.root, alias);
    mkdirSync(path.join(dir, "game-other"));
    const projects = core.listProjects();
    assert.equal(workspaceProject(projects, [sub]), nested.id);
    assert.equal(
      workspaceProject(projects, [pathToFileURL(alias).href]),
      nested.id,
    );
    assert.equal(
      workspaceProject(projects, [path.join(dir, "game-other")]),
      undefined,
    );
    assert.equal(
      workspaceProject(projects, [parent.root, nested.root]),
      undefined,
    );
    assert.equal(workspaceProject(projects, [nested.root, sub]), nested.id);
    assert.equal(
      workspaceProject(
        projects.map((p) => ({ ...p, archived: true })),
        [sub],
      ),
      undefined,
    );
    assert.equal(
      workspaceProject(
        projects.map((p) => ({ ...p, available: false })),
        [sub],
      ),
      undefined,
    );
    assert.equal(
      workspaceProject(projects, [
        "relative",
        "file://remote/game",
        path.join(dir, "missing"),
      ]),
      undefined,
    );
    const opened = dispatch(core, "studio_open", { workspaceRoot: sub }) as any;
    assert.equal(opened.project.project.id, nested.id);
    assert.equal(
      (
        dispatch(core, "studio_open", {
          projectId: parent.id,
          workspaceRoot: sub,
        }) as any
      ).project.project.id,
      parent.id,
    );
    assert.equal((dispatch(core, "studio_open", {}) as any).project, undefined);
  } finally {
    core.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
