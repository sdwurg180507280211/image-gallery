# 不喜欢状态云端同步

## 目标

用户在 GitHub Pages 图库点击“👎 不喜欢”后，不需要输入 GitHub Token。状态自动同步到 Supabase，供后续图库管理和 ChatGPT 读取。

## 数据流

1. `assets/app.js` 直接调用 `assets/feedback-store.js`，不再通过劫持 `Storage.prototype.setItem` 监听变化。
2. `feedback-store.js` 启动时读取云端状态，并使用本地 `localStorage` 作为即时 UI 缓冲和离线回退。
3. 页面点击/取消“👎 不喜欢”时，Store 先立即更新本地状态，再把变更加入 pending 队列并异步写入 Supabase Edge Function。
4. Edge Function `image-dislikes` 使用服务端权限写 `public.image_dislikes`，浏览器不持有 GitHub Token 或 Supabase service key。
5. `.github/workflows/keep-supabase-alive.yml` 每小时读取云端状态并镜像到 `data/dislikes.json`；无变化时不提交。

## Supabase

- Project ref: `xkuzzmqtboclgvkvdlwd`
- Table: `public.image_dislikes`
- Edge Function: `image-dislikes`
- 表已启用 RLS，并撤销 `anon` / `authenticated` 的直接表权限；页面只通过 Edge Function 访问。

## 本地兼容与重试

- `visual-asset-library:dislikes`：当前浏览器即时状态。
- `visual-asset-library:dislike-pending-v1`：尚未成功同步到云端的最终状态，网络恢复后继续上传。
- `visual-asset-library:dislike-cloud-migrated-v1`：标记旧版本本地状态已完成首次迁移。
- 浏览器触发 `online` 事件时会自动继续 flush pending 队列。

## 删除素材

统一使用 `scripts/delete-assets.mjs`，默认只预演：

```bash
npm run delete-assets -- aa25bf1b17c8
npm run delete-assets -- --from-dislikes
```

确认预演内容无误后才加 `--write`：

```bash
npm run delete-assets -- --from-dislikes --write
```

执行顺序：

1. 解析 asset ID，并确认所有 ID 都存在于 `data/gallery.json`。
2. 输出原图、同名元数据、提示词和缩略图缓存的删除计划。
3. `--write` 模式先清理 Supabase 中对应的“不喜欢”状态，避免云端镜像任务重新写回已删除 ID。
4. 从 `data/gallery.json` 删除素材记录。
5. 从 `data/prompt-index.json` 删除对应提示词索引。
6. 从 `data/dislikes.json` 删除对应 ID。
7. 删除原图、同名元数据、提示词文件和已知缩略图缓存。
8. 最后运行 `npm run build` 校验索引与文件一致性。

`--skip-cloud` 仅用于云端故障时的维护操作，正常删除不要使用；使用后必须人工清理 Supabase 状态。
