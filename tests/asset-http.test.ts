import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { assetHttpUrl, verifyAssetHttpUrl } from "../src/server/asset-http.js";
import { StudioCore } from "../src/server/core.js";
import { uiRequest } from "../src/server/ui.js";

test("file capabilities are scoped to one file, expire, and cannot authorize project APIs", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "studio-asset-key-"));
  try {
    const route = "/api/projects/project/files/revision/0";
    const now = Date.now();
    const url = new URL(assetHttpUrl(dir, route, now));
    const expires = url.searchParams.get("expires");
    const signature = url.searchParams.get("signature");
    assert.equal(verifyAssetHttpUrl(dir, route, expires, signature, now), true);
    assert.equal(
      verifyAssetHttpUrl(dir, `${route}1`, expires, signature, now),
      false,
    );
    assert.equal(
      verifyAssetHttpUrl(dir, "/api/projects", expires, signature, now),
      false,
    );
    assert.equal(
      verifyAssetHttpUrl(dir, route, expires, "0".repeat(64), now),
      false,
    );
    assert.equal(
      verifyAssetHttpUrl(dir, route, expires, signature, now + 300000),
      false,
    );
    assert.equal(
      statSync(path.join(dir, "asset-http.key")).mode & 0o777,
      0o600,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an opaque MCP sandbox can read signed binary files while unrelated requests stay forbidden", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "studio-asset-http-"));
  const registry = path.join(dir, "registry");
  const core = new StudioCore(registry);
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const process = spawn(
    globalThis.process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "src/server/http.ts", "--production"],
    {
      env: {
        ...globalThis.process.env,
        STUDIO_HOME: registry,
        PORT: String(port),
      },
      stdio: "pipe",
    },
  );
  const base = `http://127.0.0.1:${port}`;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("HTTP startup timed out")),
        15000,
      );
      process.stdout.on("data", (data) => {
        if (String(data).includes("Game Studio →")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      process.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error("HTTP exited"));
      });
    });
    const project = core.projectManage({
      action: "create",
      name: "HTTP 验收",
      root: path.join(dir, "game"),
    });
    const bytes = Buffer.from("binary model data\n".repeat(100000));
    const imported = core.importFiles(project.id, [
      { name: "model.txt", bytes },
    ]);
    const route = `/api/projects/${project.id}/files/${imported.id}/0`;
    const metadata = (await uiRequest(core, {
      path: `${route}/http`,
      method: "GET",
    })) as { url: string; total: number };
    // The MCP process and HTTP service share the registry/key; the service port is configurable.
    const url = new URL(metadata.url);
    url.port = String(port);
    assert.equal(metadata.total, bytes.length);
    const response = await fetch(url, { headers: { Origin: "null" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    const preflight = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: "null",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Private-Network": "true",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(
      preflight.headers.get("access-control-allow-private-network"),
      "true",
    );
    for (const origin of ["null", "https://untrusted.example"]) {
      assert.equal(
        (await fetch(`${base}${route}`, { headers: { Origin: origin } }))
          .status,
        403,
      );
      assert.equal(
        (await fetch(`${base}/api/projects`, { headers: { Origin: origin } }))
          .status,
        403,
      );
      assert.equal(
        (await fetch(url, { method: "POST", headers: { Origin: origin } }))
          .status,
        403,
      );
    }
    url.pathname = route.replace(/\/0$/, "/1");
    assert.equal(
      (await fetch(url, { headers: { Origin: "null" } })).status,
      403,
    );
  } finally {
    process.kill("SIGTERM");
    await once(process, "exit");
    core.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
