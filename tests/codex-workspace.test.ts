import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { codexWorkspace } from "../src/server/codex-workspace.js";

test("只按原生调用会话 ID 读取 cwd，不使用匿名 ID、环境会话或最近聊天", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "studio-codex-"));
  const db = new DatabaseSync(path.join(dir, "state_5.sqlite"));
  const first = "01900000-0000-7000-8000-000000000001";
  const second = "01900000-0000-7000-8000-000000000002";
  try {
    db.exec("CREATE TABLE threads(id TEXT PRIMARY KEY, cwd TEXT NOT NULL)");
    const insert = db.prepare("INSERT INTO threads VALUES (?, ?)");
    insert.run(first, "/projects/first");
    insert.run(second, "/projects/second");
    assert.equal(codexWorkspace({ threadId: first }, dir), "/projects/first");
    assert.equal(codexWorkspace({ threadId: second }, dir), "/projects/second");
    assert.equal(codexWorkspace(undefined, dir), undefined);
    assert.equal(
      codexWorkspace({ threadId: "anonymous", "openai/session": second }, dir),
      undefined,
    );
    assert.equal(
      codexWorkspace({ threadId: "01900000-0000-7000-8000-000000000099" }, dir),
      undefined,
    );
    assert.equal(
      codexWorkspace({ threadId: first }, path.join(dir, "missing")),
      undefined,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM threads").get()?.count,
      2,
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
