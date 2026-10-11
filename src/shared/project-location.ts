// Keep the project name within one directory when a save location is chosen.
export function projectDirectoryName(name: string) {
  const directory = name
    .trim()
    .replace(/[\/\\:\u0000-\u001f\u007f]/g, "-")
    .replace(/^\.+|\.+$/g, "")
    .trim();
  return directory || "untitled-game";
}

export function projectPath(parent: string, name: string) {
  return `${parent.replace(/\/$/, "")}/${projectDirectoryName(name)}`;
}
