import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, statSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { StudioError } from "./core.js";

const execute = promisify(execFile);
// NSOpenPanel runs in its own process, without requesting Finder automation
// permissions. Pass all user data as argv, never as executable script text.
const script = `
ObjC.import('AppKit');
function run(argv) {
  const app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
  app.activateIgnoringOtherApps(true);
  const panel = $.NSOpenPanel.openPanel;
  panel.canChooseFiles = false;
  panel.canChooseDirectories = true;
  panel.allowsMultipleSelection = false;
  panel.canCreateDirectories = argv[2] === 'create';
  panel.title = argv[0];
  panel.prompt = '选择';
  panel.directoryURL = $.NSURL.fileURLWithPath(argv[1]);
  return panel.runModal === $.NSModalResponseOK ? ObjC.unwrap(panel.URL.path) : '';
}`;

export const directoryPickerSchema = z.object({
  mode: z.enum(["create", "link"]),
  initialPath: z
    .string()
    .max(4096)
    .refine((p) => !p.includes("\0"))
    .optional(),
});

function startingDirectory(initialPath?: string) {
  let candidate =
    initialPath && path.isAbsolute(initialPath) ? initialPath : os.homedir();
  while (true) {
    if (existsSync(candidate) && statSync(candidate).isDirectory())
      return realpathSync(candidate);
    const parent = path.dirname(candidate);
    if (parent === candidate) return os.homedir();
    candidate = parent;
  }
}

export function createDirectoryPicker(
  run: (args: string[]) => Promise<string> = async (args) => {
    const { stdout } = await execute("/usr/bin/osascript", args, {
      timeout: 120000,
      killSignal: "SIGKILL",
      maxBuffer: 16384,
    });
    // osascript appends exactly one newline; preserve whitespace in the path.
    return stdout.replace(/\r?\n$/, "");
  },
  platform: NodeJS.Platform = process.platform,
) {
  let active = false;
  return async (input: unknown): Promise<{ path: string | null }> => {
    const { mode, initialPath } = directoryPickerSchema.parse(input);
    if (platform !== "darwin")
      throw new StudioError(
        400,
        "当前系统暂不支持文件夹选择，请手动填写项目目录。",
      );
    if (active)
      throw new StudioError(409, "文件夹选择窗口已打开，请先完成或取消选择。");
    active = true;
    try {
      const selected = await run([
        "-l",
        "JavaScript",
        "-e",
        script,
        mode === "create" ? "选择项目文件夹" : "选择已有项目文件夹",
        startingDirectory(initialPath),
        mode,
      ]);
      if (!selected) return { path: null };
      if (
        !path.isAbsolute(selected) ||
        !existsSync(selected) ||
        !statSync(selected).isDirectory()
      )
        throw new StudioError(400, "所选文件夹不可用，请重新选择。");
      return { path: realpathSync(selected) };
    } catch (error) {
      if (error instanceof StudioError) throw error;
      throw new StudioError(
        503,
        "无法完成文件夹选择，请重试或手动填写项目目录。",
      );
    } finally {
      active = false;
    }
  };
}

export const pickDirectory = createDirectoryPicker();
