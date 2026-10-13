import assert from "node:assert/strict";
import { expect } from "@playwright/test";

export async function verifyResponsiveWorkspace({ page, ui = page, prefix }) {
  const top = ui.locator(".workspace-top");
  const sidebar = ui.locator(".workspace-sidebar");
  const canvas = ui.locator(".canvas-area");
  const dock = ui.locator(".asset-dock");
  const inspector = ui.locator(".inspector");
  const originalViewport = page.viewportSize();

  // Compare against the host itself: a capped shell can still have a canvas
  // that fills its own workspace while leaving a blank strip below it.
  for (const height of [480, 720, 960, 1200]) {
    await page.setViewportSize({ width: 1440, height });
    await page.waitForTimeout(100);
    const bounds = await ui.locator(".workspace").boundingBox();
    const viewportHeight = await ui
      .locator(".workspace")
      .evaluate((element) => element.ownerDocument.defaultView.innerHeight);
    assert.ok(
      Math.abs(bounds.y + bounds.height - viewportHeight) <= 1,
      `workspace fills host height ${height}: bottom ${bounds.y + bounds.height}`,
    );
  }

  // Includes both sides of each breakpoint and the narrow Codex side panel.
  for (const width of [
    1440, 1201, 1200, 1101, 1100, 1024, 801, 800, 680, 390, 320,
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    assert.equal(
      await sidebar.isVisible(),
      width > 1100,
      `navigation at ${width}`,
    );
    assert.equal(await dock.isVisible(), width > 800, `assets at ${width}`);
    assert.equal(
      await inspector.isVisible(),
      width > 1200,
      `inspector at ${width}`,
    );
    const bounds = await canvas.boundingBox();
    assert.ok(
      bounds.width >= 320,
      `usable canvas at ${width}: ${bounds.width}`,
    );
    const workspace = await ui.locator(".workspace").boundingBox();
    const topBounds = await top.boundingBox();
    const headerBounds = await ui.locator(".canvas-header").boundingBox();
    assert.ok(
      bounds.height >=
        workspace.height - topBounds.height - headerBounds.height - 2,
      `canvas fills available host height at ${width}: ${bounds.height}`,
    );
    assert.equal(
      await ui.locator(".workspace").evaluate((element) => {
        const doc = element.ownerDocument;
        return doc.documentElement.scrollWidth > doc.defaultView.innerWidth;
      }),
      false,
      `horizontal overflow at ${width}`,
    );
    for (const label of ["便签", "导入素材", "制作角色"]) {
      const action = await ui
        .getByRole("button", { name: label, exact: true })
        .boundingBox();
      assert.ok(
        action.x >= 0 && action.x + action.width <= width,
        `${label} at ${width}`,
      );
    }
    if ([1440, 1024, 680, 390].includes(width)) {
      await page.screenshot({
        path: `var/qa/${prefix}-responsive-${width}.png`,
      });
    }
  }

  // A drawer must not consume canvas width, and keyboard dismissal returns focus.
  const narrowWidth = (await canvas.boundingBox()).width;
  await top.getByRole("button", { name: "展开项目导航", exact: true }).click();
  assert.equal(await sidebar.isVisible(), true);
  assert.equal((await canvas.boundingBox()).width, narrowWidth);
  assert.equal(
    await sidebar
      .getByRole("button", { name: "收起项目导航", exact: true })
      .evaluate((element) => element === element.ownerDocument.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  await top
    .getByRole("button", { name: "展开项目导航", exact: true })
    .waitFor();
  assert.equal(await sidebar.isVisible(), false);
  await top.getByRole("button", { name: "展开项目导航", exact: true }).click();
  await sidebar.getByRole("button", { name: "项目设置", exact: true }).click();
  assert.equal(await sidebar.isVisible(), false);
  await top.getByRole("button", { name: "展开项目导航", exact: true }).click();
  await sidebar.getByRole("button", { name: "画布", exact: true }).click();
  await top.getByRole("button", { name: "展开资源栏", exact: true }).click();
  assert.equal(await dock.isVisible(), true);
  assert.equal((await canvas.boundingBox()).width, narrowWidth);
  await top.getByRole("button", { name: "展开面板", exact: true }).click();
  assert.equal(await dock.isVisible(), false);
  assert.equal(await inspector.isVisible(), true);
  assert.equal((await canvas.boundingBox()).width, narrowWidth);
  await top.getByRole("button", { name: "收起面板", exact: true }).click();

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.waitForTimeout(100);
  const expandedWidth = (await canvas.boundingBox()).width;
  const search = dock.getByPlaceholder("搜索资源…");
  await search.fill("折叠后保留搜索");
  await dock.getByRole("button", { name: "收起项目资源", exact: true }).click();
  assert.equal(await dock.isVisible(), false);
  assert.equal((await canvas.boundingBox()).width, expandedWidth + 220);
  const reopen = ui.getByRole("button", { name: "展开项目资源", exact: true });
  // Focus moves in requestAnimationFrame after the reopen button is mounted.
  await expect
    .poll(() =>
      reopen.evaluate(
        (element) => element === element.ownerDocument.activeElement,
      ),
    )
    .toBe(true);
  await reopen.click();
  assert.equal(await dock.isVisible(), true);
  assert.equal((await canvas.boundingBox()).width, expandedWidth);
  assert.equal(await search.inputValue(), "折叠后保留搜索");
  await search.fill("");
  await top.getByRole("button", { name: "收起项目导航", exact: true }).click();
  assert.equal(await sidebar.isVisible(), false);
  assert.equal((await canvas.boundingBox()).width, expandedWidth + 240);
  await top.getByRole("button", { name: "展开项目导航", exact: true }).click();
  assert.equal((await canvas.boundingBox()).width, expandedWidth);
  await page.setViewportSize(originalViewport);
}
