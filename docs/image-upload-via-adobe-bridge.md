# 图片通过 Adobe 文件桥接入库 image-gallery

> 本文件是 `sdwurg180507280211/image-gallery` 当前唯一的图片入库操作手册。
>
> 只要任务涉及“把当前会话生成图、上传图或工作区图片写入 image-gallery”，第一步必须读取本文件；不要重新探索 Base64、Google Drive、聊天缩略图或其他临时中转方案。

## 适用场景

将 ChatGPT 当前会话可访问的原始图片、image_gen / ChatGPT Images 生成图，或当前工作区可访问的原始图片，稳定写入 `sdwurg180507280211/image-gallery`，并确保 GitHub Pages 被明确触发发布。

默认入库域为 **人物图片**；只有明确属于医药会议 KV / 医疗主视觉时才写入 `medical-kv`。

---

## 0. 当前唯一稳定链路

```text
读取本文件
        ↓
筛选本批次真实原图
        ↓
Adobe.adobe_mandatory_init（本会话首次使用 Adobe 时）
        ↓
第一张 Adobe.asset_openai_file_upload 预检
        ↓
批量 Adobe.asset_openai_file_upload
        ↓
assetId + presignedAssetUrl + mediaType
        ↓
一个一次性 GitHub Actions 导入工作流
        ↓
curl -L 下载原始图片
        ↓
MIME / 文件大小 / sharp 可解析性校验
        ↓
images/ 正式原图
        ↓
data/gallery.json v3
        ↓
prompts/assets/<id>.md + data/prompt-index.json
        ↓
npm run build
        ↓
正式 commit + git push main
        ↓
显式 workflow_dispatch .github/workflows/pages.yml
        ↓
删除一次性 workflow / 临时触发文件
        ↓
确认正式入库 commit + Pages 发布状态
```

真正的二进制传输通道是：

**原始图片 → Adobe 文件桥 → presignedAssetUrl → GitHub Actions curl → 仓库原图。**

GitHub connector 本身不需要直接承载几十 MB 的 Base64 图片。

### 0.1 必须显式触发 Pages

不要依赖“一次性导入 workflow 向 `main` push 后，`pages.yml` 会自动继续运行”。

导入 workflow 通常使用仓库 `GITHUB_TOKEN` 进行：

```bash
git push origin HEAD:main
```

GitHub 为避免 workflow 递归触发，会抑制由该 token 产生的部分后续 workflow 事件。因此：

> **由 `github-actions[bot]` / `GITHUB_TOKEN` 产生的 `main` push，不能作为 Pages 一定会自动触发的依据。**

本项目的 `.github/workflows/pages.yml` 已支持：

```yaml
workflow_dispatch:
```

因此一次性导入 workflow 在正式 push 后必须显式 dispatch Pages workflow。

推荐：

```bash
git push origin HEAD:main

gh workflow run pages.yml --ref main
```

并给一次性导入 workflow 配置：

```yaml
permissions:
  contents: write
  actions: write
```

调用 `gh` 时使用当前 workflow token：

```yaml
env:
  GH_TOKEN: ${{ github.token }}
```

如果显式 dispatch 失败，图片可以已经完成仓库入库，但**不能声称网站已经发布**。

---

## 1. 图片收集规则

### 1.1 当前会话生成图

如果任务是“上传本会话生成的图片”，优先收集真正由 image_gen / ChatGPT Images 生成的原始文件：

- 使用真实 `file_id` / 当前会话可访问的原始文件引用；
- 一次生成多张时，每张作为独立素材；
- 不使用聊天缩略图、截图或预览图代替原图；
- 不重新生成近似图替代缺失原图。

用户参考图、普通附件是否入库，以当前任务要求为准；不要把参考图误当生成成品。

### 1.2 批量文件 / ZIP

如果输入是 ZIP：

1. 先解压并筛选实际图片；
2. 保留原始 PNG / JPG / WebP 等文件，不为了上传主动降质；
3. 每张图片单独进入后续 Adobe bridge；
4. ZIP 本身不是图库资产，不提交到 `images/`。

---

## 2. Adobe 初始化与桥接预检

### 2.1 初始化

同一会话第一次调用 Adobe 工具前先执行：

`Adobe.adobe_mandatory_init`

如果本会话已经初始化过，不重复调用。

### 2.2 第一张预检

先取候选图片中的第一张调用：

`Adobe.asset_openai_file_upload`

成功条件：

- 返回 `assetId`；
- 返回 `presignedAssetUrl`；
- 返回 `mediaType`；
- `mediaType` 必须以 `image/` 开头。

第一张预检成功后，再批量桥接剩余图片。工具支持一次提交多文件时优先批量提交；只有工具明确存在数量限制时才分批。

### 2.3 硬失败规则

出现以下任一情况，停止本批次并明确报告原因：

- `asset_openai_file_upload` 当前不可用；
- 无法取得真实 `file_id` / 可访问文件引用；
- 第一张桥接失败；
- 返回结果没有 `presignedAssetUrl`；
- `mediaType` 不是 `image/*`。

此时不要自动改走：

- Google Drive 预览页 / 分享网页；
- Markdown 图片预览地址；
- 聊天缩略图 URL；
- GitHub `create_blob` 大段 Base64；
- HTML 跳转页；
- 自行猜测的公开 URL；
- 重新生成近似图片。

---

## 3. 批量 Adobe 文件桥

预检成功后，为每张图保留以下映射：

```text
批次序号
原始 file_id / 文件引用
原始文件名
原始扩展名
Adobe assetId
presignedAssetUrl
mediaType
最终 GitHub path
最终 asset id
```

`presignedAssetUrl` 只作为本次传输的临时下载地址，不长期写入图库元数据，也不保留在仓库长期配置中。

---

## 4. GitHub 一次性导入工作流

每个批次只创建 **一个** 一次性导入工作流。

不要为同一批次反复创建：

- `probe`
- `test`
- `working`
- `final`
- 多个平行上传分支

如果需要临时触发分支 / PR，只保留一个；正式入库完成后清理。

### 4.1 权限

一次性导入 workflow 至少需要：

```yaml
permissions:
  contents: write
  actions: write
```

含义：

- `contents: write`：提交图片、gallery、prompt，并 push `main`；
- `actions: write`：正式 push 后显式 dispatch `pages.yml`。

### 4.2 导入 workflow 职责

一次性 workflow 负责：

1. Checkout `main`；
2. 设置 Node.js 20；
3. 安装项目依赖；
4. 使用 Adobe `presignedAssetUrl` 下载原始图片；
5. 校验真实图片；
6. 写入 `images/` 正式路径；
7. 更新 `data/gallery.json`；
8. 写入提示词文件并更新 `data/prompt-index.json`；
9. 执行 `npm run build`；
10. 删除自身及本批次临时触发文件；
11. commit 并 push `main`；
12. **显式 dispatch `pages.yml --ref main`**。

### 4.3 不要用第二次空提交触发 Pages

不要把以下方式作为正常流程：

```text
import bot push main
        ↓
发现 Pages 没运行
        ↓
人工创建 refresh trigger
        ↓
再用普通用户身份 push 一次
```

这只能作为历史故障补救，不是标准架构。

标准方案是在导入 workflow 内主动：

```bash
gh workflow run pages.yml --ref main
```

---

## 5. GitHub 端下载原图

一次性导入 workflow 使用 Adobe 返回的 `presignedAssetUrl`：

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

同时使用项目已有 `sharp` 读取图片，确认真实尺寸可解析。

禁止把以下内容保存为图片：

- Adobe 登录页；
- 403 / 404 HTML；
- JSON 错误页；
- 空文件；
- 文本错误信息；
- 网页预览页。

---

## 6. v3 的素材真源：data/gallery.json

**只把 PNG / JPG 放进 `images/` 不算完成入库。**

当前 `scripts/build.mjs` 不会扫描 `images/` 自动发现新素材；它以：

`data/gallery.json`

作为素材真源，再读取其中的 `asset.path` 找原图、校验尺寸并生成缩略图。

因此每张新图片必须同时拥有一条 v3 资产记录。

### 6.1 人物图片

人物图片最小记录：

```json
{
  "id": "稳定唯一ID",
  "path": "images/<人物slug>/<主题或场景slug>/file.png",
  "title": "素材标题",
  "domain": "character",
  "category": "pink",
  "tags": ["补充搜索词"],
  "createdAt": "ISO 8601 时间"
}
```

当前人物 `category` 只使用：

- `multi-panel`：多宫图 / 多分镜；
- `black`；
- `red`；
- `pink`；
- `blue`；
- `white`；
- `purple`；
- `green`；
- `gold`；
- `other`。

规则：

1. 明确属于多宫图时优先 `multi-panel`；
2. 否则只按人物服装主色归类；
3. 黑金仍归黑色系、红金仍归红色系，不再叠加第二分类。

### 6.2 医药 KV

医药 KV 最小记录：

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

页面内容分类只使用 `color`；`organ` 仅作为描述 / 搜索元数据，`used` 是业务状态。

### 6.3 不再创建新 sidecar JSON

当前 v3 新图片**不要**再创建：

```text
image.png
image.json
```

这套 sidecar Metadata V2 已退出当前入库架构。

旧 sidecar 只作为 Git 历史证据，用于历史提示词重建；新入库直接维护 `data/gallery.json`。

### 6.4 构建派生字段

不要手工填写：

- `width`
- `height`
- `thumbnail`
- `thumbnailLarge`
- `thumbnailLargeWidth`

这些字段由 `scripts/build.mjs` 根据真实原图写入 `dist/data/gallery.json`。

---

## 7. 提示词必须与新图片同步入库

项目已经建立提示词归档体系。新图片不要再制造“先入图库、以后补 prompt”的历史欠账。

每张新素材原则上同时新增：

```text
prompts/assets/<asset-id>.md
```

并更新：

```text
data/prompt-index.json
```

索引结构：

```json
{
  "path": "prompts/assets/<asset-id>.md",
  "kind": "original"
}
```

`kind` 只使用：

- `original`：确实取得并保存了生成该图的原始提示词；
- `reconstructed`：无法证明逐字原始 prompt，根据图片、当前元数据、人物母提示词或医药 KV 母提示词重建。

不要把重建提示词冒充 `original`。

### 7.1 人物提示词

人物图优先保留：

- 同一人物身份锚点；
- 本张服装 / 配色；
- 场景；
- 动作；
- 表情；
- 镜头 / 构图；
- 光线与风格；
- 必要负面约束。

人物身份和单张临时服装、武器、法球、背景必须分开。

### 7.2 医药 KV 提示词

医药 KV 没有原始逐字 prompt 时，使用：

`prompts/medical-kv-16x9-base.md`

作为当前统一视觉母规范，再结合该图的：

- 主色；
- 主医学主体；
- tags；
- 构图方向；
- 主视觉体量和留白；

生成 `reconstructed` 提示词。

---

## 8. 构建与校验

仓库存在 `package-lock.json` 时优先：

```bash
npm ci --no-audit --no-fund
npm run build
```

如果当前仓库标准工作流使用 `npm install --no-audit --no-fund`，以仓库现有 workflow 为准，不为此额外引入兼容层。

`npm run build` 必须至少验证：

- `data/gallery.json` 为 schemaVersion 3；
- asset ID 不重复；
- asset path 不重复；
- 每条记录对应原图真实存在；
- 图片可被 `sharp` 解析；
- `data/prompt-index.json` 指向真实素材；
- prompt 文件真实存在；
- category / color / organ / used 等字段合法；
- 缩略图可正常生成。

构建失败时不得提交半成品图库。

---

## 9. 正式提交与 Pages 发布

只有以下内容全部完成后才允许正式提交：

- 原图已下载并验证；
- `data/gallery.json` 已同步；
- 提示词已同步；
- `data/prompt-index.json` 已同步；
- `npm run build` 成功。

正式提交示例：

```bash
git add images data/gallery.json prompts data/prompt-index.json
git commit -m "feat(gallery): import images via Adobe bridge"
git push origin HEAD:main
```

### 9.1 push 后必须显式 dispatch Pages

紧接着执行：

```bash
gh workflow run pages.yml --ref main
```

建议同一 step 中明确设置：

```yaml
env:
  GH_TOKEN: ${{ github.token }}
```

项目当前 `pages.yml` 同时支持：

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

其中 `push` 继续服务普通用户 / 外部正常 push；**导入 workflow 自己的 bot push 一律按显式 `workflow_dispatch` 处理，不依赖递归触发。**

### 9.2 推荐的最终 shell 顺序

```bash
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

git add -A
git commit -m 'feat(gallery): import images via Adobe bridge'
git push origin HEAD:main

gh workflow run pages.yml --ref main
```

不要在 `git push` 与 `gh workflow run` 之间加入人为 refresh commit。

---

## 10. 成功判定：入库与发布分开

以后不要再用一个“上传成功”同时代表仓库和网站两个状态。

### 10.1 仓库入库成功

满足以下条件才可以说“图片已入库”：

- 正式 import commit 已出现在 `main`；
- 本批次原图真实存在；
- `data/gallery.json` 已包含对应记录；
- prompt / prompt-index 已同步；
- import workflow 中 `npm run build` 已通过。

### 10.2 Pages 发布已触发

满足以下条件才可以说“网站发布已触发”：

- 正式 import commit 已进入 `main`；
- `gh workflow run pages.yml --ref main` / workflow dispatch 请求已成功提交。

### 10.3 Pages 发布成功

只有 Pages workflow 最终成功完成，才可以说：

> **网站已发布 / 新图已上线。**

如果 Pages 仍在 queued / in_progress，只能说：

> **图片已入库，Pages 已触发，发布尚未完成。**

如果 dispatch 失败，只能说：

> **图片已入库，但 Pages 未成功触发。**

### 10.4 检查策略

不要高频轮询。

在用户明确要求“上传到网站 / 确认能看见”时：

1. 正式入库 commit 后显式 dispatch Pages；
2. 对对应 Pages workflow 做有限检查；
3. 成功则报告网站已发布；
4. 仍运行中则准确报告当前状态；
5. 失败则直接查该次 run / job 日志，不制造第二次空 push。

不要用浏览器缓存问题解释尚未确认的部署失败。

---

## 11. 临时文件与分支清理

正式入库并完成 Pages dispatch 后：

- 删除一次性 import workflow；
- 删除本批次临时触发文件；
- 关闭未合并的触发 PR；
- 清理本批次无意义的 probe / test / working / final 分支；
- 不把 `presignedAssetUrl` 长期留在仓库。

不要为了同一个批次不断创建新的测试分支。

注意：清理临时 workflow / trigger 可以包含在正式 import commit 中；但无论采用哪种方式，都不能因为清理动作产生另一个“为了触发 Pages”的空提交。

---

## 12. 故障模式：图片已进 main，但 Pages 没更新

如果出现：

- 图片 blob 已存在；
- `data/gallery.json` 已有记录；
- import commit 已进入 `main`；
- 网站仍然没有新图；

第一优先检查：

> **这次 import commit 是否由 `github-actions[bot]` / `GITHUB_TOKEN` push，以及 importer 是否显式 dispatch 了 `pages.yml`。**

不要第一时间归因于：

- 浏览器缓存；
- 前端筛选；
- `cache: no-store`；
- 图片没有进入仓库。

标准修复不是创建普通用户 refresh commit，而是修正 importer，让后续每次：

```text
bot push main
        ↓
explicit workflow_dispatch pages.yml
```

---

## 13. 最终检查表

```text
[ ] 已先读取本文件
[ ] 已筛选真实原图
[ ] Adobe 已初始化
[ ] 第一张 bridge 预检成功
[ ] 全批次取得 image/* presignedAssetUrl
[ ] 只创建一个一次性导入 workflow
[ ] importer permissions 含 contents: write
[ ] importer permissions 含 actions: write
[ ] 原图 MIME / size / sharp 校验成功
[ ] 原图写入 images/
[ ] data/gallery.json v3 已更新
[ ] 每张图已有 original / reconstructed prompt
[ ] data/prompt-index.json 已更新
[ ] npm run build 成功
[ ] 正式入库 commit 已进入 main
[ ] 已显式 workflow_dispatch pages.yml --ref main
[ ] 已根据任务要求确认 Pages 当前状态
[ ] 一次性 workflow 已删除
[ ] 临时触发文件 / 无用分支已清理
[ ] 没有为了触发 Pages 创建第二次空 refresh commit
```

## 核心原则

1. **先读项目规则，不重新发明上传方案。**
2. **Adobe 文件桥解决 ChatGPT / 工作区图片到可下载 URL 的问题。**
3. **GitHub Actions 负责拉取原始二进制、验证、构建和提交。**
4. **`data/gallery.json` 是 v3 素材真源，`images/` 目录本身不会自动入库。**
5. **新图片与提示词同步归档。**
6. **正式 `main` import commit 代表仓库入库成功。**
7. **bot push 后必须显式 dispatch `pages.yml`，不能依赖递归 push 触发。**
8. **只有 Pages workflow 成功后，才能声称网站已发布。**
