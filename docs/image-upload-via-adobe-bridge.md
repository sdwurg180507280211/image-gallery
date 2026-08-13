# 图片通过 Adobe 文件桥接入库 image-gallery

## 适用场景

将 ChatGPT 当前会话可访问的原始图片或工作区本地图片，稳定写入 `sdwurg180507280211/image-gallery`。

## 稳定链路

```text
当前会话 / 工作区原始图片
        ↓
Adobe.asset_openai_file_upload
        ↓
assetId + presignedAssetUrl + mediaType
        ↓
一次性 GitHub Actions
        ↓
curl -L 下载原始图片
        ↓
MIME / 文件大小 / sharp 可解析性校验
        ↓
images/ 正式路径 + data/gallery.json v3
        ↓
npm run build
        ↓
git commit + push main
```

## 1. Adobe 桥接预检

先取第一张图片调用：

`Adobe.asset_openai_file_upload`

成功条件：

- 返回 `assetId`；
- 返回 `presignedAssetUrl`；
- 返回 `mediaType`；
- `mediaType` 必须以 `image/` 开头。

预检成功后，再把全部图片在一次调用中批量桥接。不要使用 Google Drive 预览页、聊天缩略图、HTML 跳转页或人工猜测的公开 URL 代替 Adobe 文件桥。

## 2. GitHub 端下载原图

一次性导入工作流使用 Adobe 返回的 `presignedAssetUrl`：

```bash
curl \
  -L \
  --fail \
  --silent \
  --show-error \
  --retry 3 \
  --retry-delay 2 \
  --retry-all-errors \
  "$url" \
  -o "$imagePath"
```

下载后至少校验：

```bash
mime=$(file -b --mime-type "$imagePath")
size=$(wc -c < "$imagePath")

[[ "$mime" == image/* ]]
[[ "$size" -ge 1024 ]]
```

同时用项目已有 `sharp` 读取图片，确认实际尺寸可解析。不要把 Adobe 登录页、403/404 HTML、JSON 错误页或空文件保存成图片。

## 3. 当前 v3 数据写入规则

当前项目直接维护 `data/gallery.json` 的 `schemaVersion: 3` 源数据。医药 KV 最小记录：

```json
{
  "id": "稳定唯一ID",
  "path": "images/medical-kv/YYYY-MM/file.png",
  "title": "素材标题",
  "domain": "medical-kv",
  "color": "blue",
  "organ": "heart",
  "used": false,
  "tags": ["补充搜索词"],
  "createdAt": "ISO 8601 时间"
}
```

页面内容分类只使用 `color`；`organ` 仅作为描述和搜索元数据，`used` 是业务状态。

不手工生成 `width`、`height`、`thumbnail`、`thumbnailLarge`。这些字段由当前 `scripts/build.mjs` 从真实图片构建到 `dist/data/gallery.json`。

## 4. 构建和提交

仓库存在 `package-lock.json` 时使用：

```bash
npm ci --no-audit --no-fund
npm run build
```

只有原图校验、v3 数据校验和构建全部通过后，才提交：

```bash
git add images data/gallery.json docs/image-upload-via-adobe-bridge.md
git commit -m "feat(gallery): import images via Adobe bridge"
git push origin HEAD:main
```

## 5. 临时工作流

导入工作流只服务一次批次。取得正式图片导入 commit 后删除临时 workflow，不把 presigned URL 长期保留在仓库。

## 核心原则

真正的传输通道是：

**原始图片 → Adobe 文件桥 → presignedAssetUrl → GitHub Actions curl → 仓库原图。**

Adobe 负责把 ChatGPT/工作区文件变成 GitHub 可下载的真实图片 URL；GitHub Actions 负责下载、验证、构建和提交。
