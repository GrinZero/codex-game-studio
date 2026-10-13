import assert from "node:assert/strict";

export async function verifyResponsiveHome({ page, ui = page, prefix }) {
  const original = page.viewportSize();
  for (const width of [1440, 1101, 1100, 801, 800, 769, 768, 680, 390, 320]) {
    for (const height of [420, 900]) {
      await page.setViewportSize({ width, height });
      await ui.locator(".home-top").waitFor();
      await page.waitForTimeout(50);
      assert.equal(await ui.locator(".home-sidebar").isVisible(), width > 1100);
      const top = await ui.locator(".home-top").boundingBox();
      const section = await ui.locator(".projects-section").boundingBox();
      assert.ok(
        section.y >= top.y + top.height - 1,
        `header overlap at ${width}x${height}`,
      );
      for (const selector of [
        ".home-actions .search",
        ".home-actions .button",
        ".project-card",
      ]) {
        for (const element of await ui.locator(selector).all()) {
          const bounds = await element.boundingBox();
          assert.ok(
            bounds.x >= 0 && bounds.x + bounds.width <= width + 1,
            `${selector} fits ${width}`,
          );
          if (selector !== ".project-card")
            assert.ok(
              bounds.y + bounds.height <= top.y + top.height + 1,
              `action inside header ${width}`,
            );
        }
      }
      assert.equal(
        await ui
          .locator("html")
          .evaluate(
            (element) =>
              element.scrollWidth >
              element.ownerDocument.defaultView.innerWidth,
          ),
        false,
      );
    }
    if ([1440, 680, 390].includes(width))
      await page.screenshot({ path: `var/qa/${prefix}-home-${width}.png` });
  }
  await ui
    .getByRole("button", { name: "展开项目列表导航", exact: true })
    .click();
  assert.equal(await ui.locator(".home-sidebar").isVisible(), true);
  await page.keyboard.press("Escape");
  assert.equal(await ui.locator(".home-sidebar").isVisible(), false);
  await page.setViewportSize(original);
}
