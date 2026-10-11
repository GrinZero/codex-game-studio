import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { linkSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export const assetRoute = /^\/api\/projects\/[\w-]+\/files\/[\w-]+\/\d+$/;
const lifetime = 5 * 60 * 1000;
export function assetHttpOrigin() {
  return `http://127.0.0.1:${Number(process.env.PORT || 4310)}`;
}

// HTTP and stdio processes share a local key, never sent to the renderer.
// Link a completed file atomically so concurrent processes cannot read half a key.
function signingKey(configDir: string) {
  const file = path.join(configDir, "asset-http.key");
  try {
    return readFileSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = `${file}.${randomBytes(12).toString("hex")}`;
  writeFileSync(temporary, randomBytes(32), { mode: 0o600, flag: "wx" });
  try {
    try {
      linkSync(temporary, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  } finally {
    unlinkSync(temporary);
  }
  return readFileSync(file);
}
function signature(configDir: string, route: string, expires: string) {
  return createHmac("sha256", signingKey(configDir))
    .update(`${route}\n${expires}`)
    .digest();
}
export function assetHttpUrl(
  configDir: string,
  route: string,
  now = Date.now(),
) {
  if (!assetRoute.test(route)) throw new Error("无效资源路径");
  const expires = String(now + lifetime);
  const token = signature(configDir, route, expires).toString("hex");
  return `${assetHttpOrigin()}${route}?expires=${expires}&signature=${token}`;
}
export function verifyAssetHttpUrl(
  configDir: string,
  route: string,
  expires: unknown,
  token: unknown,
  now = Date.now(),
) {
  if (
    !assetRoute.test(route) ||
    typeof expires !== "string" ||
    !/^\d+$/.test(expires) ||
    Number(expires) <= now ||
    Number(expires) > now + lifetime ||
    typeof token !== "string" ||
    !/^[a-f0-9]{64}$/.test(token)
  )
    return false;
  return timingSafeEqual(
    signature(configDir, route, expires),
    Buffer.from(token, "hex"),
  );
}
