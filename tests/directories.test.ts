import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDirectoryPicker } from "../src/server/directories.js";
import {
  projectDirectoryName,
  projectPath,
} from "../src/shared/project-location.js";

test("选择位置生成单个子目录，中文、特殊字符与根目录不会逃逸", () => {
  assert.equal(
    projectPath("/Users/test/Games/", " Starforger "),
    "/Users/test/Games/Starforger",
  );
  assert.equal(projectPath("/", "星铸者"), "/星铸者");
  for (const name of ["", "..", ".", "../escape", "a/b\\c", "\0"])
    assert.equal(path.dirname(projectPath("/games", name)), "/games");
  assert.equal(projectDirectoryName(".."), "untitled-game");
});

test("原生选择器以参数传递路径，从尚未创建的目录回到现有父目录", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "studio-picker-"));
  const selected = path.join(temp, '项目 "quotes" $(whoami) ');
  mkdirSync(selected);
  try {
    const picker = createDirectoryPicker(async (args) => {
      assert.equal(args[5], realpathSync(temp));
      assert.equal(args[6], "create");
      assert.ok(!args[3].includes(temp));
      return selected;
    }, "darwin");
    const result = await picker({
      mode: "create",
      initialPath: path.join(temp, "not-yet", "game"),
    });
    assert.equal(result.path, realpathSync(selected));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("取消正常返回；选择过程中禁止重复打开，结束后可再次选择", async () => {
  let finish!: (value: string) => void;
  const picker = createDirectoryPicker(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    "darwin",
  );
  const pending = picker({ mode: "link" });
  await assert.rejects(picker({ mode: "link" }), /窗口已打开/);
  finish("");
  assert.deepEqual(await pending, { path: null });
  const next = picker({ mode: "link" });
  finish("");
  assert.deepEqual(await next, { path: null });
});

test("打开失败或返回无效路径后释放选择器，并保留清晰错误", async () => {
  let attempts = 0;
  const picker = createDirectoryPicker(async () => {
    if (attempts++ === 0) throw new Error("timeout");
    return "relative/path";
  }, "darwin");
  await assert.rejects(picker({ mode: "create" }), /重试或手动填写/);
  await assert.rejects(picker({ mode: "create" }), /所选文件夹不可用/);
  await assert.rejects(picker({ mode: "other" }));
  await assert.rejects(picker({ mode: "link", initialPath: "bad\0path" }));
});

test("其他系统明确提示手动输入，不调用本机脚本", async () => {
  const picker = createDirectoryPicker(async () => {
    assert.fail("should not launch");
  }, "linux");
  await assert.rejects(picker({ mode: "link" }), /手动填写/);
});
