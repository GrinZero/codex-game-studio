# 命名与资源类型速查

[返回规范](project-file-guide.md) · 版本 1.2

## 1. 一套名字表达一组资产

**N01 必须：** 同一个资产族共享稳定词根。概念、模型、材质、贴图、动画的名字必须能对应。例如 `ranger` 始终代表巡林者，不能在不同软件里分别变成 `hero`、`char01` 和 `new_person`。中文显示名与技术词根的对应可放项目文档或工作台标签。

默认通用文件名：

```text
<asset_name>[_<variant>][_<purpose>][_<detail>].<extension>
ranger_winter_base_color.png
rock_granite_03_lod1.glb
```

| 字段         | 作用                           | 例子                             |
| ------------ | ------------------------------ | -------------------------------- |
| `asset_name` | 可独立理解的资产族             | `ranger`、`wooden_chest`         |
| `variant`    | 外观、材质或同类变体，可组合   | `winter`、`granite_03`           |
| `purpose`    | 文件用途，扩展名不够明确时填写 | `base_color`、`anim_run`、`icon` |
| `detail`     | 必要细节，避免堆入所有属性     | `lod1`、序列帧 `0001`            |
| `extension`  | 实际格式                       | `blend`、`glb`、`png`            |

**N02 必须：** 同一命名适配内固定字段顺序。新文件采用“词根 → 变体 → 用途 → 细节”，例如 `ranger_winter_base_color`。字段可由多个单词组成，不能靠简单拆分下划线恢复全部元数据。

**N03 应当：** 单个清晰用途不重复加类型词：`ranger.glb` 已可辨认为模型，`ranger_mesh_model.glb` 多余。多种资源共享同一扩展名时补足用途，例如 `ranger_material.tres`、`ranger_stats.tres`。一个源工程包含模型、绑定和动画可叫 `ranger.blend`；独立制作阶段才使用 `ranger_rig.blend` 等名称。

## 2. 字符、编号与路径

**N04 必须：** 新建通用资源与目录采用小写 ASCII 字母、数字、单下划线；以字母开头，扩展名小写。不使用空格、尾部点／空格、系统保留名称，不创建仅大小写不同的两个文件。文档约定名（`README.md` 等）、引擎原生名字、生成的身份文件、语言类名和原第三方包名按适配保留。

中文用于显示名、正文和标签；不要求用户改账户名或搬离已有中文路径。对现有路径先检查实际工具兼容性，不能把“含中文”直接当作项目损坏。

**N05 应当：** 通用变体可从 `01` 开始，数量较大可以选三位或更长，同一组保持一致。语义可区分时优先 `pine_young`、`pine_old`。修订用版本管理或交付目录 `v003/`；帧序列用单独的固定位数，如 `fire_loop_0001.png`。不得用重新编号覆盖旧变体的身份。

**N06 必须：** 保持明确相对位置，避免目录层层重复。`characters/ranger/ranger.glb` 有益于独立文件识别，`characters/character_assets/ranger/ranger_models/mesh/ranger.glb` 应简化。路径预算按最受限的导出器、引擎和平台确定，不将某个商店的长度限制当作通用常数。大小写重命名按引擎与版本控制流程执行。

**N07 必须：** 选定的类型词汇一致使用。已有 `albedo` 可作为 `base_color` 的项目别名，已有 `rough` 可映射 `roughness`；新增资源不在同一用途上随机切换。正常运行资源不使用 `temp`、`new`、`final_final` 等无法说明身份的名称。

## 3. 通用资源词典

下表提供默认用途词和示例。扩展名是示例，由实际工具决定；某类型不存在时无需建立占位文件。引擎原生资产使用[适配表](engine-profiles.md)。

| 类型               | 默认用途词／命名                         | 示例与说明                                              |
| ------------------ | ---------------------------------------- | ------------------------------------------------------- |
| 可编辑模型工程     | 不加用途词，阶段拆开时用 `model`         | `ranger.blend`、`ranger_model.blend`                    |
| 高模／低模制作产物 | `high`、`low`                            | `ranger_high.blend`；与运行 LOD 分开                    |
| 静态／蒙皮模型交付 | 通常不加词；需区分时用 `mesh`、`skinned` | `wooden_chest.glb`、`ranger_skinned.glb`                |
| 运行 LOD           | `lod0`、`lod1`                           | `wooden_chest_lod1.glb`；也可存于同一引擎资产           |
| 绑定工程／骨架数据 | `rig`、`skeleton`                        | `ranger_rig.blend`；`skeleton` 只用于确实独立的骨架数据 |
| 动画片段           | `anim_<action>`                          | `ranger_anim_idle.glb`、`ranger_anim_run.glb`           |
| 动画控制资源       | `anim_controller`、`anim_blend`          | `ranger_anim_controller.controller`；按引擎类型适配     |
| 形变目标           | `morph_<expression>`                     | `ranger_morph_smile`，可作为模型内部对象名              |
| 场景／预制体       | 名称足够时不加词                         | `ranger.tscn`、`ranger.prefab`                          |
| 材质／实例配置     | `material`                               | `ranger_material.tres`、`ranger_winter_material.mat`    |
| shader／材质函数   | `shader`、`shader_function`              | `foliage_wind.shader`；类型已明确可省略重复词           |
| 碰撞／物理材质     | `collision`、`physics_material`          | `wooden_chest_collision.glb`；原生碰撞名按导入器要求    |
| 精灵图／精灵表     | `sprite`、`spritesheet`                  | `slime_sprite.png`、`slime_spritesheet.png`             |
| 图集／瓦片集       | `atlas`、`tileset`                       | `forest_tileset.png`；布局与索引数据保留共同词根        |
| UI 图标／面板图    | `icon`、`panel`                          | `health_icon.png`、`inventory_panel.png`                |
| UI 组件／主题      | `widget`、`theme`，类型明确时可省略      | `inventory.tscn`、`inventory_theme.tres`                |
| 字体               | 保留字体族和字重                         | `source_sans_regular.ttf`；第三方原名可保留             |
| 特效组合           | `vfx`，或原生场景名                      | `fireball_vfx.tscn`，专用贴图沿用 `fireball` 词根       |
| 音效               | `sfx`                                    | `wooden_chest_open_sfx.wav`                             |
| 音乐／环境声       | `music`、`ambience`                      | `forest_music.ogg`、`forest_night_ambience.wav`         |
| 配音               | `voice` 加台词 ID 和语言码               | `ranger_voice_greeting_001_zh_cn.wav`；词序作为项目约定 |
| 音频事件／混音配置 | `audio_event`、`audio_mix`               | `chest_open_audio_event`；与源波形区分                  |
| 视频／过场序列     | `video`、`sequence`                      | `intro_video.mp4`、引擎序列 `intro_sequence`            |
| 数值／配置／数据表 | `stats`、`config`、`table`               | `ranger_stats.json`、`items_table.csv`                  |
| AI 行为数据        | `behavior`、`blackboard`                 | `ranger_behavior`、`ranger_blackboard`；按原生格式保存  |
| 预览／缩略图       | `preview`、`thumbnail`                   | `ranger_preview.png`、`ranger_thumbnail.webp`           |
| 概念／正交参考     | `concept`、`reference_front`             | `ranger_concept.kra`、`ranger_reference_front.png`      |
| 资源说明／来源     | `README.md`、集中来源清单                | 与资产组或包保存，避免重复说明                          |

脚本按语言规则命名并靠近功能；`RangerController.cs` 与 `ranger_controller.gd` 都可正确采用本规范。文件名规则不强制改写代码内变量、类、节点或函数的既有风格。

## 4. 贴图词典与通道契约

| 语义           | 默认后缀           | 例子                    | 应记录的内容                         |
| -------------- | ------------------ | ----------------------- | ------------------------------------ |
| 基础色         | `base_color`       | `ranger_base_color.png` | RGB 为颜色；Alpha 是否承担透明度     |
| 法线           | `normal`           | `ranger_normal.png`     | 切线／对象空间、目标导入器的方向约定 |
| 粗糙度         | `roughness`        | `ranger_roughness.png`  | 标量数据；不要与 smoothness 混用     |
| 金属度         | `metallic`         | `ranger_metallic.png`   | 标量数据                             |
| 环境遮蔽       | `ao`               | `ranger_ao.png`         | 使用的通道                           |
| 自发光         | `emissive`         | `ranger_emissive.png`   | 颜色或遮罩、是否需要 HDR             |
| 透明度         | `opacity`          | `foliage_opacity.png`   | 裁切或混合用途                       |
| 高度           | `height`           | `stone_height.exr`      | 数值范围和比例；与法线分开           |
| 镜面反射工作流 | `specular`         | `glass_specular.png`    | 与项目采用的材质工作流一致           |
| 特定遮罩       | `mask_<purpose>`   | `ranger_mask_dirt.png`  | 各通道具体含义                       |
| 打包数据       | 明确约定的通道缩写 | `ranger_orm.png`        | 每个通道语义和空通道值               |

**T01 必须：** 打包名称与通道说明一致。采用 `orm` 时约定 R=AO、G=Roughness、B=Metallic，Alpha 未使用或另行明确。其他打包方案需自己的映射说明，不能仅改名就视为完成转换。基础色 Alpha 存透明度时也要注明。

**T02 必须：** 导入时区分颜色与数据；扩展名和后缀不能代替设置。基础色通常按 sRGB 颜色解释，normal／roughness／metallic 等按相应非颜色规则处理。其他色彩管理流程需记录转换与导入方式。法线方向不同或粗糙度／光滑度不同需要实际转换和检查。

**T03 应当：** 通用适配使用 `metallic` 与 `mask_dirt` 等完整词消除缩写歧义；采用 UE 字母后缀时维护自己的词典。通道打包、Alpha 使用与压缩格式按平台验证，不制定脱离平台的统一禁令。

## 5. 完整资源组示例

Godot 风格示例；其他引擎替换原生场景、材质、脚本形式及所选命名适配：

```text
characters/ranger/
├── ranger.tscn
├── ranger_controller.gd
├── ranger.glb
├── ranger_material.tres
├── ranger_base_color.png
├── ranger_normal.png
├── ranger_orm.png
├── ranger_stats.tres
├── animations/                 # 动画较多时再划分
│   ├── ranger_anim_idle.glb
│   └── ranger_anim_run.glb
└── variants/winter/
    ├── ranger_winter.tscn
    ├── ranger_winter_material.tres
    └── ranger_winter_base_color.png
```

冬装可以显式复用基础模型、骨架和动画，不需要复制完整文件集；依赖由场景和交付说明表达。独立蒙皮／动画文件与另一个骨架是否兼容，必须实际验证。

```text
environments/forest/rocks/
├── rock_granite_01.glb
├── rock_granite_02.glb
├── rock_granite_material.tres
├── rock_granite_base_color.png
└── rock_granite_normal.png
```

两块岩石确实共用材质时，以 `rock_granite` 资产族命名材质即可，无需虚构两套独立贴图。跨多个领域复用时再考虑提升共享范围。

## 6. 常见问题与改法

| 问题                                                | 建议                                                          | 理由                                   |
| --------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| `新建角色 最终2.glb`                                | 新资源采用 `ranger.glb`，历史进入版本管理                     | 名字表达身份，修订单独记录             |
| `bob_albedo_evil.png` 与 `bob_evil_normal.png` 混用 | 新规则统一为 `bob_evil_base_color.png`、`bob_evil_normal.png` | 同一变体相同顺序；旧文件迁移需更新引用 |
| `tree.png` 同时可能是图标或贴图                     | `tree_icon.png` 或 `tree_base_color.png`                      | 消除扩展名不能表达的歧义               |
| `Forest.png` 与 `forest.png`                        | 确认身份后用不同语义名称                                      | 避免大小写冲突                         |
| `character_skeleton.glb` 实际只有普通网格           | 按真实内容命名                                                | 名称不能证明含骨架                     |
| `ranger_v2.glb` 实际是冬装                          | `ranger_winter.glb`                                           | 变体与修订分离                         |
| 下载模型只有 GLTF JSON                              | 检查 BIN、纹理与引用                                          | 主文件存在不代表完整资源集             |
