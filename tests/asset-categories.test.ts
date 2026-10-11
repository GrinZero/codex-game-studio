import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assetCategory,
  assetCategoryTags,
  explicitAssetCategory,
} from "../src/shared/asset-categories";

test("林谷遗迹资源按用途分为角色、装备和植被；具体用途优先于主角前缀", () => {
  for (const name of ["胸甲", "腿部装备", "靴子", "法杖", "单手剑", "弓"])
    assert.equal(
      assetCategory({ name: `主角 · ${name}`, kind: "model", tags: [] }),
      "装备",
    );
  assert.equal(
    assetCategory({ name: "主角 · 角色本体", kind: "model", tags: [] }),
    "角色",
  );
  for (const name of ["针叶树 · 高大型", "针叶灌木 · 疏簇型"])
    assert.equal(assetCategory({ name, kind: "model", tags: [] }), "植被");
  assert.equal(
    assetCategory({ name: "森林设计", kind: "document", tags: [] }),
    "文档",
  );
  assert.equal(
    assetCategory({ name: "森林背景音乐", kind: "audio", tags: [] }),
    "音效",
  );
  assert.equal(
    assetCategory({ name: "unknown.glb", kind: "model", tags: [] }),
    "其他",
  );
});

test("手动分类优先于推断，恢复自动分类保留其他标签", () => {
  const asset = {
    name: "主角 · 法杖",
    kind: "model" as const,
    tags: ["低多边形", "分类:道具"],
  };
  assert.equal(assetCategory(asset), "道具");
  assert.deepEqual(assetCategoryTags(asset, "装备"), ["低多边形", "分类:装备"]);
  const automatic = { ...asset, tags: assetCategoryTags(asset) };
  assert.deepEqual(automatic.tags, ["低多边形"]);
  assert.equal(explicitAssetCategory(automatic), undefined);
  assert.equal(assetCategory(automatic), "装备");
  assert.throws(
    () => assetCategoryTags({ ...asset, tags: Array(30).fill("保留") }, "装备"),
    /标签数量/,
  );
});
