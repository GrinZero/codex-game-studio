export type AssetFile = { blob: Blob; name: string };
type LoadedFile = AssetFile & { url: string };
type Entry = {
  users: number;
  controller: AbortController;
  promise: Promise<LoadedFile>;
  file?: LoadedFile;
};

// Share an in-flight transfer and object URL only while consumers own it.
// The last release cancels transfer, drops the Blob and revokes the URL.
export class AssetFileCache {
  private entries = new Map<string, Entry>();
  constructor(
    private read: (route: string, signal: AbortSignal) => Promise<AssetFile>,
  ) {}
  acquire(route: string) {
    let entry = this.entries.get(route);
    if (!entry) {
      const controller = new AbortController();
      entry = { users: 0, controller, promise: undefined! };
      const current = entry;
      entry.promise = Promise.resolve()
        .then(() => {
          controller.signal.throwIfAborted();
          return this.read(route, controller.signal);
        })
        .then((file) => {
          controller.signal.throwIfAborted();
          current.file = { ...file, url: URL.createObjectURL(file.blob) };
          return current.file;
        })
        .catch((error) => {
          if (this.entries.get(route) === current) this.entries.delete(route);
          throw error;
        });
      this.entries.set(route, entry);
    }
    entry.users++;
    const current = entry;
    let released = false;
    return {
      promise: entry.promise,
      release: () => {
        if (released) return;
        released = true;
        current.users--;
        // React StrictMode may reacquire synchronously after an effect cleanup.
        queueMicrotask(() => {
          if (current.users) return;
          current.controller.abort();
          if (this.entries.get(route) === current) this.entries.delete(route);
          if (current.file) {
            URL.revokeObjectURL(current.file.url);
            current.file = undefined;
          }
        });
      },
    };
  }
}
