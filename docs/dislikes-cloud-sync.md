# 不喜欢状态云端同步

## 目标

用户在 GitHub Pages 图库点击“👎 不喜欢”后，不需要输入 GitHub Token。状态会自动同步到 Supabase，供后续图库管理和 ChatGPT 读取。

## 数据流

1. 页面入口先加载 `assets/dislikes-sync.js`。
2. 同步脚本读取本地 `visual-asset-library:dislikes`，并与云端状态合并。
3. 页面点击/取消“👎 不喜欢”时，原有 `app.js` 仍更新 localStorage；同步脚本拦截变化并写入 Supabase Edge Function。
4. Edge Function `image-dislikes` 使用服务端权限写 `public.image_dislikes`，浏览器不持有 GitHub Token 或 Supabase service key。
5. `.github/workflows/keep-supabase-alive.yml` 每小时读取云端状态并镜像到 `data/dislikes.json`；无变化时不提交。

## Supabase

- Project ref: `xkuzzmqtboclgvkvdlwd`
- Table: `public.image_dislikes`
- Edge Function: `image-dislikes`
- 表已启用 RLS，并撤销 `anon` / `authenticated` 的直接表权限；页面只通过 Edge Function 访问。

## 删除“不喜欢”素材时

以 Supabase `public.image_dislikes` 为即时来源，`data/dislikes.json` 为自动镜像。

删除某个不喜欢素材时应同时：

1. 从 `data/gallery.json` 删除素材记录。
2. 删除原图、对应元数据/缩略图来源和提示词关联文件（如存在）。
3. 从 `data/prompt-index.json` 删除对应提示词索引（如存在）。
4. 从 Supabase `public.image_dislikes` 删除对应 `asset_id`。
5. 确认 `data/dislikes.json` 不再包含该 ID（自动同步会最终覆盖；批量删除时可同步清理以避免构建窗口出现陈旧 ID）。
6. 运行/检查构建，避免 `data/dislikes.json` 指向已删除素材导致构建校验失败。

## 兼容性

- 本地 localStorage 仍作为即时 UI 和网络失败时的缓冲。
- 未同步操作存放在 `visual-asset-library:dislike-pending-v1`，后续页面加载会继续尝试上传。
- `visual-asset-library:dislike-cloud-migrated-v1` 用于把升级前已有的本地“不喜欢”首次迁移到云端。
