# Image Gallery 元数据说明

本文档记录当前图库实际使用的元数据与构建规则。不要把历史实验能力当成现行约束。

## 当前数据源

页面构建以 `data/gallery.json` 为主索引：

```json
{
  "schemaVersion": 3,
  "assets": [
    {
      "id": "固定素材 ID",
      "path": "images/<character>/<series>/<file>.png",
      "title": "作品标题",
      "domain": "character",
      "category": "red",
      "tags": ["红裳仙姬"],
      "createdAt": "2026-08-03T00:00:00Z"
    }
  ]
}
```

医药 KV 使用同一份 `gallery.json`，但字段为：

```json
{
  "id": "固定素材 ID",
  "path": "images/medical-kv/...",
  "title": "作品标题",
  "domain": "medical-kv",
  "organ": "heart"
}
```

当前构建不要求 `used` 或医药主色字段。

## 人物与系列

人物素材目录遵循：

```text
images/<character>/<series>/<file>
```

构建时会自动补充：

- `characterId`：默认取第一层人物目录名。
- `seriesSlug`：默认取第二层系列目录名。
- `seriesId`：默认由 `<characterId>--<seriesSlug>` 组成。

如果 `gallery.json` 中显式提供这些字段，则以显式值为准。

构建还会生成：

```text
dist/data/character-series.json
```

供页面的“系列”浏览模式使用。

## 提示词索引

提示词关联维护在：

```text
data/prompt-index.json
```

当前支持：

- `original`
- `reconstructed`

构建会检查提示词关联的素材 ID 是否存在、提示词类型是否合法，以及对应提示词文件是否真实存在。

## 不喜欢状态

仓库镜像文件：

```text
data/dislikes.json
```

这里只是云端“不喜欢”状态的仓库镜像与回退种子。页面运行时以 `assets/feedback-store.js` 的云端同步逻辑为主。

构建会检查：

- `schemaVersion` 是否正确
- `assetIds` 是否为数组
- 是否存在重复 ID
- 每个 ID 是否仍存在于图库

## 当前构建校验

执行：

```bash
npm run build
```

当前构建会检查：

- `data/gallery.json` 必须是 `schemaVersion: 3`
- 每张素材必须有 `id / path / title`
- `domain` 必须是 `character` 或 `medical-kv`
- 人物 `category` 必须属于当前固定分类
- 医药 KV `organ` 必须属于当前固定器官分类
- 素材 ID 不得重复
- 素材路径不得重复
- 原图文件必须存在
- 图片尺寸必须可读取
- `prompt-index.json` 的关联必须有效
- `dislikes.json` 的关联必须有效
- 人物目录必须满足 `images/<character>/<series>/<file>`，除非未来明确调整构建规则

构建会生成 640px WebP 缩略图；符合条件的横图还会生成 1280px 缩略图，并清理不再使用的缩略图缓存。

## 当前没有的能力

以下内容不是当前构建能力，不应作为上传或维护前提：

- 不做图片内容重复检测或 pHash 检测
- 不做“完全重复原图”阻断
- 不生成 `data/validation-report.json`
- 不要求 `data/taxonomy-v2.json`
- 当前 `package.json` 没有 `freeze-ids` 命令
- 当前没有 commerce / R2 构建配置

如以后重新引入这些能力，应先修改代码，再同步更新本文档。

## 删除素材

当前安全删除入口：

```bash
npm run delete-assets -- <asset-id>
npm run delete-assets -- --from-dislikes
npm run delete-assets -- --from-dislikes --write
```

默认只预演；只有 `--write` 才会真正修改文件。正常流程会先清理云端“不喜欢”状态，再删除图库索引、提示词索引、仓库镜像、原图、同名 JSON 与已知缩略图缓存。

## 上传图片

上传图片前，先读取并遵循：

```text
docs/image-upload-via-adobe-bridge.md
```

该文档是当前项目图片上传流程的正式入口。
