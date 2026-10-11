import { test } from "node:test";
import assert from "node:assert/strict";
import { AssetFileCache } from "../src/ui/asset-file-cache.js";

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));
test("active previews share a URL; only the last release revokes it", async () => {
  let reads = 0;
  const cache = new AssetFileCache(async () => {
    reads++;
    return { blob: new Blob(["model"]), name: "model.glb" };
  });
  const inspector = cache.acquire("model");
  const canvas = cache.acquire("model");
  const file = await inspector.promise;
  assert.equal((await canvas.promise).url, file.url);
  assert.equal(reads, 1);
  inspector.release();
  inspector.release();
  await flush();
  assert.equal(await (await fetch(file.url)).text(), "model");
  canvas.release();
  await flush();
  await assert.rejects(fetch(file.url));
  const reopened = cache.acquire("model");
  assert.notEqual((await reopened.promise).url, file.url);
  assert.equal(reads, 2);
  reopened.release();
});
test("StrictMode cleanup followed by reacquire keeps the shared transfer alive", async () => {
  const cache = new AssetFileCache(async (_route, signal) => {
    signal.throwIfAborted();
    return { blob: new Blob(["model"]), name: "model.glb" };
  });
  const first = cache.acquire("model");
  first.release();
  const second = cache.acquire("model");
  assert.equal(first.promise, second.promise);
  await second.promise;
  second.release();
});
test("abandoned transfers abort and never create a late object URL", async () => {
  let finish!: (file: { blob: Blob; name: string }) => void;
  let signal!: AbortSignal;
  const cache = new AssetFileCache(async (_route, abort) => {
    signal = abort;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const lease = cache.acquire("model");
  const rejection = assert.rejects(lease.promise, { name: "AbortError" });
  await flush();
  lease.release();
  await flush();
  assert.equal(signal.aborted, true);
  finish({ blob: new Blob(["model"]), name: "model.glb" });
  await rejection;
});
test("failed transfers can retry without an old release deleting the new entry", async () => {
  let reads = 0;
  const cache = new AssetFileCache(async () => {
    if (++reads === 1) throw new Error("offline");
    return { blob: new Blob(["model"]), name: "model.glb" };
  });
  const failed = cache.acquire("model");
  await assert.rejects(failed.promise, /offline/);
  const retry = cache.acquire("model");
  failed.release();
  await flush();
  const third = cache.acquire("model");
  assert.equal(third.promise, retry.promise);
  await retry.promise;
  retry.release();
  third.release();
});
