# Image Gallery

一个用于整理、浏览和展示生成式人物作品的静态图库。网站由 GitHub Pages 托管，GitHub Actions 自动生成图片索引、640px WebP 缩略图和发布目录。

## 当前能力

- 原图与缩略图分离：首页加载 WebP，灯箱和下载使用原图
- 按原图 SHA-256 增量复用缩略图
- 人物、主题、场景、配色、构图和资产类型多维筛选
- 标题、描述、动作、表情、人物特征和标签全文搜索
- 本地收藏、明暗主题、灯箱和键盘切图
- 元数据冲突检查与 `data/validation-report.json` 报告
- GitHub Actions 自动构建并发布 `dist/`

## 在线地址

```text
https://sdwurg180507280211.github.io/image-gallery/
```

仓库首次启用 Pages 时，在 **Settings → Pages** 将 Source 设为 **GitHub Actions**。

## 图片目录

原图放入 `images/`，建议第一层使用人物 slug，第二层只使用主要内容主题：

```text
images/
└── red-robed-immortal/
    ├── portrait/
    ├── battle/
    ├── magic/
    ├── celestial/
    └── character-sheet/
```

场景、服装颜色和构图主要记录在同名 JSON 中，不再无限扩展目录层级。

## 元数据 V2

同名文件示例：

```text
images/red-robed-immortal/magic/moon-summoning.png
images/red-robed-immortal/magic/moon-summoning.json
```

```json
{
  "schemaVersion": 2,
  "id": "固定图片 ID",
  "title": "月宫召唤",
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
  "featured": true
}
```

完整规范见 [`docs/metadata-v2.md`](./docs/metadata-v2.md)，允许值见 [`data/taxonomy-v2.json`](./data/taxonomy-v2.json)。

## 固定现有图片 ID

移动已有图片前先把当前 ID 写入同名 JSON，避免收藏失效：

```bash
npm run freeze-ids
npm run freeze-ids -- --write
```

第一条是预演，第二条才实际写入。执行结果记录在 `data/id-freeze-manifest.json`。

## 构建与预览

需要 Node.js 20 或更高版本：

```bash
npm install
npm run build
npm run serve
```

打开：

```text
http://localhost:4173
```

构建产物：

```text
dist/
├── index.html
├── assets/
├── data/
├── images/
└── generated/thumbnails/
```

## 图片生成窗口协作

每个仍保留原始图片资产和视觉上下文的生成窗口负责：

1. 逐张查看实际画面。
2. 排除用户参考图、截图、失败图和重复图。
3. 按 V2 字段分类，不确定字段留空。
4. 保留原始 `file_id`、生成顺序、时间和 SHA-256。
5. 在 `data/imports/` 提交窗口级 manifest。

图库管理窗口负责：

- 维护全局分类词表
- 合并 manifest
- 解决跨窗口冲突和重复
- 修改前端、构建与校验程序
- 在 ID 固定后执行最终目录迁移

manifest 格式见 [`data/imports/README.md`](./data/imports/README.md)。
