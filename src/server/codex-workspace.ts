import { readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Resolve only the native caller identity; shared MCP process state is ambiguous. */
export function codexWorkspace(
  meta: Record<string, unknown> | undefined,
  codexDirectory = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
) {
  const id = meta?.threadId;
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
  )
    return;
  let databases: string[];
  try {
    databases = readdirSync(codexDirectory)
      .filter((name) => /^state_\d+\.sqlite$/.test(name))
      .sort((a, b) => Number(b.match(/\d+/)![0]) - Number(a.match(/\d+/)![0]));
  } catch {
    return;
  }
  for (const file of databases) {
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(path.join(codexDirectory, file), {
        readOnly: true,
      });
      const row = db.prepare("SELECT cwd FROM threads WHERE id = ?").get(id);
      if (typeof row?.cwd === "string" && path.isAbsolute(row.cwd))
        return row.cwd;
    } catch {
      // Schema changes or unavailable local state leave the project picker usable.
    } finally {
      db?.close();
    }
  }
}
