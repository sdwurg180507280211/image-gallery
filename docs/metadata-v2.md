# Image Gallery 元数据 V2

V2 将“人物是谁、画面表现什么、在哪里、什么配色、怎样构图、属于哪类资产”拆成独立维度，避免把颜色、场景和拼图形式混进同一个主题目录。

## 标准字段

```json
{
  "schemaVersion": 2,
  "id": "固定且不随路径变化的图片 ID",
  "title": "作品标题",
  "description": "作品说明",
  "character": "红裳仙姬",
  "theme": ["magic"],
  "scene": ["moon-night", "palace"],
  "palette": ["black-gold"],
  "composition": ["single-image", "close-up"],
  "assetType": "artwork",
  "actions": ["魔法召唤", "直视镜头"],
  "expressions": ["清冷", "妩媚"],
  "confirmedTraits": ["成年东方女性", "黑色长发"],
  "tags": ["互动视线"],
  "createdAt": "2026-08-03T00:00:00Z",
  "featured": false,
  "sourceFileId": "file_...",
  "generationSequence": 1,
  "generatedAt": "2026-08-03T00:00:00Z",
  "sourceChat": "生成人物特写图",
  "sourceSha256": "完整原图 SHA-256"
}
```

## 字段职责

- `character`：人物身份，只回答“她是谁”。
- `theme`：内容题材，如肖像、战斗、魔法、火焰魔法、武侠。
- `scene`：环境，如雪境、宫廷、沙漠、月夜、花园。
- `palette`：服装与主色，如红金、黑金、翡翠金、紫金。
- `composition`：景别和布局，可同时包含 `single-image` 与 `close-up`。
- `assetType`：普通作品、拼图、角色设定图、建模参考图或部件参考图。
- `confirmedTraits`：只写经过画面或明确设定确认的稳定特征；不确定时留空。

允许值及中文显示名称统一维护在 `data/taxonomy-v2.json`。

## 兼容旧数据

构建脚本仍读取旧字段：

- `category` 会作为 `character` 的兼容来源。
- 旧 `tags` 会保留用于搜索。
- 旧目录会暂时辅助推断主题、场景、配色和构图。
- 推断产生的冲突会写入 `data/validation-report.json`，不会静默覆盖原始元数据。

## 固定图片 ID

移动目录前必须将当前索引中的 `id` 写入同名 JSON：

```bash
npm run freeze-ids
npm run freeze-ids -- --write
```

第一次命令只预演并生成 `data/id-freeze-manifest.json`；第二次才写入同名 JSON。

## 构建校验

```bash
npm run build
```

构建会检查：

- 重复图片 ID
- 完全重复的原图内容
- 未登记的主题、场景、配色、构图和资产类型
- 把颜色或拼图形式写进主题字段
- `single-image` 与 `multi-panel` 同时出现
- 人物稳定特征中的互斥描述
- 尚未固化到同名 JSON 的 ID

只有重复 ID 等阻断错误会令构建失败；其余问题进入报告，供图片生成窗口逐张复核。
