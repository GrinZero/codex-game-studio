import type { Asset } from "./types";

export const assetCategories = [
  "角色",
  "装备",
  "植被",
  "建筑",
  "道具",
  "场景",
  "界面",
  "特效",
  "音效",
  "文档",
  "其他",
] as const;
export type AssetCategory = (typeof assetCategories)[number];
const categoryPrefix = "分类:";
type CategorizedAsset = Pick<Asset, "name" | "kind" | "tags">;

export function explicitAssetCategory(
  asset: CategorizedAsset,
): AssetCategory | undefined {
  return assetCategories.find((category) =>
    asset.tags.includes(categoryPrefix + category),
  );
}

export function inferAssetCategory(asset: CategorizedAsset): AssetCategory {
  const text = `${asset.name} ${asset.tags.filter((tag) => !tag.startsWith(categoryPrefix)).join(" ")}`;
  // Specific uses precede character names: “主角 · 法杖” belongs to equipment.
  const rules: [AssetCategory, RegExp][] = [
    [
      "装备",
      /装备|武器|盔甲|护甲|胸甲|靴|法杖|剑|弓|盾|头盔|手套|\b(weapon|sword|bow|shield|armor|armour|boots?|helmet|staff|equipment)\b/i,
    ],
    [
      "植被",
      /植被|树|灌木|草丛|花卉|藤蔓|苔藓|植物|\b(tree|pine|bush|shrub|grass|plant|foliage|flower)\b/i,
    ],
    [
      "建筑",
      /建筑|房屋|城堡|围墙|墙壁|柱|屋顶|桥梁|石门|废墟|遗迹|\b(building|house|castle|wall|pillar|roof|bridge|ruins?)\b/i,
    ],
    ["界面", /界面|按钮|图标|菜单|\b(ui|hud|icon|button|menu)\b/i],
    ["特效", /特效|粒子|\b(vfx|particle|effect)\b/i],
    [
      "角色",
      /角色|主角|敌人|怪物|巡林者|人物|\b(character|hero|enemy|monster|npc|ranger)\b/i,
    ],
    [
      "道具",
      /道具|宝箱|药水|灯笼|箱子|家具|\b(prop|chest|potion|lantern|crate|furniture)\b/i,
    ],
    [
      "场景",
      /场景|地形|地面|地表|岩石|石块|天空|环境|\b(scene|terrain|ground|rock|sky|environment)\b/i,
    ],
  ];
  if (asset.kind === "document" || asset.kind === "source") return "文档";
  if (asset.kind === "audio") return "音效";
  return rules.find(([, pattern]) => pattern.test(text))?.[0] ?? "其他";
}

export function assetCategory(asset: CategorizedAsset): AssetCategory {
  return explicitAssetCategory(asset) ?? inferAssetCategory(asset);
}

export function assetCategoryTags(
  asset: CategorizedAsset,
  category?: AssetCategory,
): string[] {
  const tags = asset.tags.filter((tag) => !tag.startsWith(categoryPrefix));
  if (category) tags.push(categoryPrefix + category);
  if (tags.length > 30)
    throw new Error("标签数量已达上限，请先减少标签再设置分类。");
  return tags;
}
