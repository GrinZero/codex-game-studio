// Launch context belongs to this app instance, not a global last-used project.
let projectId =
  new URLSearchParams(location.search).get("projectId") || undefined;
const listeners = new Set<() => void>();
export function launchProject() {
  return projectId;
}
export function subscribeLaunch(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function receiveLaunch(value: unknown) {
  if (!value || typeof value !== "object") return;
  const data = value as {
    projectId?: unknown;
    project?: { project?: { id?: unknown } };
  };
  const next = data.projectId || data.project?.project?.id;
  if (typeof next !== "string" || !next || next === projectId) return;
  projectId = next;
  for (const listener of listeners) listener();
}
