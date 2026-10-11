import { mkdirSync } from "node:fs";
import path from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);

const base = process.env.STUDIO_TEST_URL || "http://127.0.0.1:4312";
const output = path.resolve("var/qa/redesign");
mkdirSync(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

try {
  // 1. Home - Dark
  await page.goto(base);
  await page.waitForLoadState("networkidle");
  // ensure dark theme
  await page.evaluate(() => {
    localStorage.setItem("codex_theme", "dark");
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.className = "dark";
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(output, "home-dark.png"), fullPage: true });

  // 2. Home - Light
  await page.evaluate(() => {
    localStorage.setItem("codex_theme", "light");
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.className = "light";
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(output, "home-light.png"), fullPage: true });

  // 3. Switch back to Dark & Open Demo Project
  await page.evaluate(() => {
    localStorage.setItem("codex_theme", "dark");
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.className = "dark";
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button").filter({ hasText: "星铸者 · 示例" }).first().click();
  await page.locator(".asset-node").first().waitFor();
  await page.getByRole("button", { name: "fit view" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(output, "canvas-dark.png"), fullPage: true });

  // 4. Canvas - Light
  await page.evaluate(() => {
    localStorage.setItem("codex_theme", "light");
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.className = "light";
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button").filter({ hasText: "星铸者 · 示例" }).first().click();
  await page.locator(".asset-node").first().waitFor();
  await page.getByRole("button", { name: "fit view" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(output, "canvas-light.png"), fullPage: true });

  // 5. Select Asset Node to view Inspector
  await page.locator(".asset-node").first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, "inspector-asset-light.png"), fullPage: true });

  // 6. Assets Tab
  await page.getByRole("button", { name: "资源", exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, "assets-view-light.png"), fullPage: true });

  // 7. Runs Tab
  await page.getByRole("button", { name: "运行记录", exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, "runs-view-light.png"), fullPage: true });

  // 8. Overview Tab - Dark
  await page.evaluate(() => {
    localStorage.setItem("codex_theme", "dark");
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.className = "dark";
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button").filter({ hasText: "星铸者 · 示例" }).first().click();
  await page.getByRole("button", { name: "概览", exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, "overview-dark.png"), fullPage: true });

  console.log("Screenshots saved successfully to var/qa/redesign");
} finally {
  await browser.close();
}
