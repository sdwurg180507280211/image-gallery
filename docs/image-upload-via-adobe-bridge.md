# 图片通过 Adobe 文件桥接入库 image-gallery

> 本文件是 `sdwurg180507280211/image-gallery` 当前唯一的图片入库操作手册。
>
> 只要任务涉及“把当前会话生成图、上传图或工作区图片写入 image-gallery”，第一步必须读取本文件。不要重新探索 Base64、Google Drive、聊天缩略图或其他临时中转方案。

## 适用场景

将 ChatGPT 当前会话可访问的原始图片、image_gen / ChatGPT Images 生成图，或当前工作区可访问的原始图片，稳定写入 `sdwurg180507280211/image-gallery`，并明确区分：

1. 原图传输成功；
2. 仓库入库成功；
3. GitHub Pages 发布已触发；
4. GitHub Pages 发布成功。

默认入库域为 **人物图片**；只有明确属于医药会议 KV / 医疗主视觉时才写入 `medical-kv`。

---

## 0. 当前唯一稳定链路

```text
读取本文件
        ↓
筛选本批次真实原图并去重
        ↓
逐图确定 title / category / tags / prompt
        ↓
生成本批次 manifest
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
MIME / 文件大小 / SHA-256 / sharp 校验
        ↓
images/ 正式原图
        ↓
data/gallery.json v3
        ↓
prompts/assets/<id>.md + data/prompt-index.json
        ↓
批次数量一致性校验
        ↓
npm run build
        ↓
正式 commit + git push main
        ↓
显式 workflow_dispatch pages.yml
        ↓
删除一次性 workflow / 临时触发文件
        ↓
确认仓库入库状态 + Pages 状态
```

真正的二进制传输通道是：

**原始图片 → Adobe 文件桥 → presignedAssetUrl → GitHub Actions curl → 仓库原图。**

GitHub connector 本身不需要直接承载几十 MB 的 Base64 图片。

### 0.1 Actions 只负责机械执行，不负责猜图片语义

一次性 importer 可以自动完成：

- 下载；
- 文件校验；
- SHA 去重；
- 写文件；
- 写已准备好的 metadata；
- 写已准备好的 prompt；
- build；
- commit；
- Pages dispatch。

但是 importer **不要**根据文件名正则、标题关键词或场景词临时猜：

- 人物服装主色；
- 医药 KV 主色；
- 人物身份特征；
- 动作、表情、姿态；
- 镜头、构图和光线；
- reconstructed prompt 的具体内容。

这些语义信息必须在创建 importer 前，根据当前图片和生成上下文准备完成。

---

## 1. 图片收集与批次清单

### 1.1 当前会话生成图

如果任务是“上传本会话生成的图片”，优先收集真正由 image_gen / ChatGPT Images 生成的原始文件：

- 使用真实 `file_id` / 当前会话可访问的原始文件引用；
- 一次生成多张时，每张作为独立素材；
- 不使用聊天缩略图、截图或预览图代替原图；
- 不重新生成近似图替代缺失原图；
- 用户参考图、参考 ZIP、总览缩略图不要误当成生成成品。

### 1.2 批量文件 / ZIP

如果输入是 ZIP：

1. 先解压并筛选实际图片；
2. 排除参考图、重复副本、缩略图和非成品；
3. 保留原始 PNG / JPG / WebP，不为了上传主动降质；
4. 每张图片单独进入后续 Adobe bridge；
5. ZIP 本身不是图库资产，不提交到 `images/`。

### 1.3 去重发生在 Adobe bridge 前

先确定本批次：

```text
candidateCount = 筛选后的候选原图数
```

如果当前环境可直接读取文件字节，优先使用 SHA-256 去重；如果桥接前只能通过文件引用判断，则至少根据真实文件来源、生成序号和重复附件关系先做一轮去重，下载后再用 SHA-256 做最终确认。

不得把“发现 69 个文件引用”直接表述成“新增 69 张素材”。

---

## 2. 入库前先准备逐图 manifest

在创建一次性 workflow 前，为每张候选图准备确定的数据，而不是在 Actions 里临时推断。

推荐的内存 / 临时 manifest 结构：

```json
{
  "order": 1,
  "sourceFileId": "file_...",
  "originalFileName": "example.png",
  "title": "素材标题",
  "domain": "character",
  "category": "blue",
  "tags": ["同一人物", "蓝色礼服", "海岸"],
  "promptKind": "reconstructed",
  "prompt": "逐图完整提示词"
}
```

医药 KV 使用 `color / organ / used` 等 v3 字段。

### 2.1 人物分类必须看“服装主色”，不能看场景词

人物分类规则保持不变：

1. 明确属于多宫图时优先 `multi-panel`；
2. 否则只按**人物服装主色**归类；
3. 黑金归 `black`，红金归 `red`；
4. 背景、花朵、建筑、天气、节日、灯光颜色不能代替服装主色。

当前允许：

- `multi-panel`
- `black`
- `red`
- `pink`
- `blue`
- `white`
- `purple`
- `green`
- `gold`
- `other`

### 2.2 禁止用标题正则自动分类

禁止类似：

```js
if (/红梅|葡萄园|书斋|圣诞|古寺/.test(title)) return 'red';
if (/荷塘|森林|茶亭/.test(title)) return 'green';
if (/霓虹/.test(title)) return 'black';
```

原因：这些词描述的通常是**场景**，不等于人物服装主色。

例如：

```text
“雪夜红梅中的蓝衣佳人”
```

应该根据“蓝衣”及实际画面归为 `blue`，不能因为“红梅”归为 `red`。

### 2.3 分类证据优先级

人物服装颜色的证据优先级：

```text
实际图片视觉判断
> 当前生成上下文中明确的服装描述
> 可靠的逐图 metadata
> 文件标题中的明确服装词
> 场景词 / 背景词（不得作为分类依据）
```

如果无法可靠判断服装主色，不要硬猜，使用 `other` 或先补充视觉判断。

---

## 3. 提示词必须在入库前准备好

项目已经建立提示词归档体系。新图片不要再制造“先入图库、以后补 prompt”的历史欠账。

每张新素材原则上同时新增：

```text
prompts/assets/<asset-id>.md
```

并更新：

```text
data/prompt-index.json
```

`kind` 只使用：

- `original`：确实取得并保存了生成该图的原始提示词；
- `reconstructed`：无法证明逐字原始 prompt，根据图片和可靠上下文重建。

不要把重建提示词冒充 `original`。

### 3.1 reconstructed prompt 的最低质量要求

`reconstructed` 不能只是：

```text
标题 + category + 一段通用模板
```

也不能只写：

```text
“生成一张高分辨率肖像，主题为 XXX，服装颜色为 XXX。”
```

每张人物图至少应尽量覆盖：

- 稳定人物身份锚点；
- 本张实际服装款式；
- 本张实际服装主色；
- 主要配饰；
- 场景；
- 动作 / 姿态；
- 表情和眼神；
- 景别 / 镜头角度；
- 构图；
- 光线；
- 色调 / 氛围；
- 材质和细节重点；
- 必要负面约束。

如果当前图片可见，就应根据实际图片重建，而不是仅根据文件名重建。

### 3.2 不允许错误 category 反向污染 prompt

不要把图库分类字段机械写进 prompt 后当成事实。

例如图片实际是蓝衣，但 category 被误标成 `red` 时，不能再生成：

```text
人物服装主色按图库归类为 red
```

正确顺序是：

```text
先看图片确认服装颜色
→ 写正确 category
→ 再写与图片一致的 prompt
```

### 3.3 证据不足时不要编造

如果无法取得原始 prompt，也无法可靠查看图片细节：

- 不要凭标题编造复杂动作、服装、镜头；
- 不要把低置信度推断写成确定事实；
- 优先补充图片视觉分析后再入库。

对于本项目的人物图片，目标是“可用于重新生成相近作品”，不是仅为了让 prompt 文件存在。

### 3.4 医药 KV

医药 KV 没有原始逐字 prompt 时，使用：

`prompts/medical-kv-16x9-base.md`

作为统一视觉母规范，再结合该图实际的：

- 主色；
- 主医学主体；
- 构图方向；
- 主视觉体量；
- 留白；
- 辅助元素；
- 光线和材质；

生成 `reconstructed` prompt。

---

## 4. Adobe 初始化与桥接预检

### 4.1 初始化

同一会话第一次调用 Adobe 工具前先执行：

`Adobe.adobe_mandatory_init`

如果本会话已经初始化过，不重复调用。

### 4.2 第一张预检

先取候选图片中的第一张调用：

`Adobe.asset_openai_file_upload`

成功条件：

- 返回 `assetId`；
- 返回 `presignedAssetUrl`；
- 返回 `mediaType`；
- `mediaType` 必须以 `image/` 开头。

第一张预检成功后，再批量桥接剩余图片。

### 4.3 硬失败规则

出现以下任一情况，停止本批次并明确报告原因：

- `asset_openai_file_upload` 当前不可用；
- 无法取得真实 `file_id` / 可访问文件引用；
- 第一张桥接失败；
- 返回结果没有 `presignedAssetUrl`；
- `mediaType` 不是 `image/*`。

此时不要自动改走：

- Google Drive 预览页；
- Markdown 图片预览地址；
- 聊天缩略图 URL；
- GitHub `create_blob` 大段 Base64；
- HTML 跳转页；
- 自行猜测的公开 URL；
- 重新生成近似图片。

---

## 5. Adobe bridge 映射

预检成功后，为每张图保留：

```text
批次序号
sourceFileId / 文件引用
原始文件名
Adobe assetId
presignedAssetUrl
mediaType
预先确定的 title / category / tags / promptKind / prompt
最终 GitHub path
最终 asset id
```

`presignedAssetUrl` 只作为本次传输的临时下载地址，不长期写入图库元数据或 import manifest。

---

## 6. GitHub 一次性导入 workflow

每个批次只创建 **一个** 一次性导入 workflow。

禁止为同一批次反复创建：

- `probe`
- `test`
- `working`
- `final`
- 第二个 importer
- 多个平行上传分支

### 6.1 权限

```yaml
permissions:
  contents: write
  actions: write
```

并设置：

```yaml
env:
  GH_TOKEN: ${{ github.token }}
```

### 6.2 workflow 职责

一次性 importer 只消费已经准备好的 manifest，并负责：

1. Checkout `main`；
2. 设置 Node.js 20；
3. 安装依赖；
4. 下载 Adobe 原图；
5. MIME / size / SHA-256 / sharp 校验；
6. 当前批次 SHA 去重；
7. 检查是否已存在于 gallery / 正式路径；
8. 写入 `images/`；
9. 写入 manifest 中已经确定的 v3 metadata；
10. 写入 manifest 中已经确定的 prompt；
11. 更新 `data/prompt-index.json`；
12. 校验批次数量；
13. `npm run build`；
14. 删除 importer 自身和临时触发文件；
15. commit + push `main`；
16. 显式 dispatch `pages.yml --ref main`。

### 6.3 importer 必须幂等，但不允许主动重复执行

推荐以图片完整 SHA-256 作为重复检测依据，并使用稳定 ID / path。

再次运行同一 importer 时，不应重复新增 gallery 记录或 prompt。

但是：

> **幂等只是事故保护，不是允许重复运行 importer 的理由。**

一旦正式入库 commit 已经出现在 `main`：

- 不要重新创建 importer；
- 不要再次下载整批图片；
- 不要为了检查 Pages 再运行 importer；
- Pages 有问题只处理 Pages，不重新执行图片入库。

---

## 7. GitHub 端下载和原图校验

使用：

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

同时：

- 计算 SHA-256；
- 使用 `sharp` 读取实际宽高；
- 拒绝无法解析的文件。

禁止把以下内容保存为图片：

- Adobe 登录页；
- 403 / 404 HTML；
- JSON 错误页；
- 空文件；
- 文本错误信息；
- 网页预览页。

---

## 8. v3 素材真源：data/gallery.json

**只把 PNG / JPG 放进 `images/` 不算完成入库。**

当前 `scripts/build.mjs` 不扫描 `images/` 自动发现新素材；它以：

`data/gallery.json`

作为素材真源。

### 8.1 人物最小记录

```json
{
  "id": "稳定唯一ID",
  "path": "images/<人物slug>/<主题slug>/file.png",
  "title": "素材标题",
  "domain": "character",
  "category": "blue",
  "tags": ["补充搜索词"],
  "createdAt": "ISO 8601 时间"
}
```

### 8.2 医药 KV 最小记录

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

医药 KV 页面内容分类只使用 `color`；`organ` 是描述 / 搜索元数据，`used` 是业务状态。

### 8.3 不再创建新 sidecar JSON

当前 v3 新图片不要创建：

```text
image.png
image.json
```

旧 sidecar Metadata V2 只作为 Git 历史证据使用。

### 8.4 构建派生字段

不要手工填写：

- `width`
- `height`
- `thumbnail`
- `thumbnailLarge`
- `thumbnailLargeWidth`

这些由 `scripts/build.mjs` 写入 `dist/data/gallery.json`。

---

## 9. 批次数量与一致性校验

这是批量导入的强制步骤。

至少记录：

```text
candidateCount   筛选后的候选原图数
bridgedCount     Adobe bridge 成功数
downloadedCount 实际下载并通过文件校验数
uniqueCount     SHA-256 去重后的唯一图片数
existingCount   已经存在于仓库、因此跳过的数量
addedCount      本次实际新增 gallery 记录数
promptCount     本次实际写入 / 关联 prompt 数
```

如果本批次声明“全部都是新图”，应满足：

```text
candidateCount
= bridgedCount
= downloadedCount
= uniqueCount
= addedCount
= promptCount
```

如果存在历史重复图，则必须明确列出：

```text
existingCount
skipped asset id / path
```

最终对用户汇报时：

- “处理了 69 个 URL” ≠ “新增 69 张”；
- “下载了 69 张” ≠ “gallery 新增 69 条”；
- 只有 `addedCount` 和正式 commit diff 能证明实际新增数量。

对于批量导入，建议把不含 `presignedAssetUrl` 的最终映射写入：

```text
data/imports/<batch-name>.json
```

用于记录 asset id、final path、SHA-256、宽高和批次计数。

---

## 10. 构建与正式提交

仓库存在 `package-lock.json` 时优先：

```bash
npm ci --no-audit --no-fund
npm run build
```

构建至少验证：

- `data/gallery.json` schemaVersion 3；
- asset ID 不重复；
- asset path 不重复；
- 原图存在且 sharp 可解析；
- category / color / organ / used 合法；
- `data/prompt-index.json` 有效；
- prompt 文件存在；
- 缩略图生成成功。

只有全部通过后才：

```bash
git add -A
git commit -m "feat(gallery): import images via Adobe bridge"
git push origin HEAD:main
```

### 10.1 正式 commit 出现后立即停止 importer 生命周期

一旦确认正式入库 commit 已进入 `main`：

```text
Importer lifecycle = finished
```

之后即使：

- Pages 状态未知；
- GitHub connector 暂时看不到 workflow run；
- 网站尚未刷新；

也**不得重新 stage / recreate / trigger importer**。

后续问题进入 Pages 发布排查流程。

---

## 11. Pages 必须显式 dispatch

不要依赖一次性 importer 的 `GITHUB_TOKEN` push 自动递归触发 Pages。

Importer 正式 push 后执行：

```bash
gh workflow run pages.yml --ref main
```

项目当前 `pages.yml` 支持：

```yaml
workflow_dispatch:
```

### 11.1 Pages 状态分级

严格使用以下表述：

**仓库入库成功**

> 正式 import commit 已进入 `main`，图片 / gallery / prompt 已确认，build 已通过。

**Pages 发布已触发**

> `gh workflow run pages.yml --ref main` 命令已成功执行，或已经取得对应 workflow run。

**Pages 发布成功**

> 对应 Pages workflow 最终 conclusion 为 success / deploy 完成。

如果当前连接器无法验证 workflow 最终状态，只能说：

> 仓库入库已确认；Importer 已包含 / 已执行 Pages dispatch，但 Pages 最终发布状态尚未验证。

不能把“代码里存在 `gh workflow run`”直接等同于“网站已发布”。

### 11.2 不要通过重跑 importer 修 Pages

如果 Pages dispatch 失败或状态未知：

- 重新 dispatch `pages.yml`；或
- 排查 `pages.yml` 权限 / workflow 本身；

不要重新下载、重新登记、重新构建整批图片。

---

## 12. 临时资源清理

正式入库完成后：

- 一次性 importer 应已自删除；
- 删除临时触发文件；
- 关闭未合并触发 PR；
- 清理本批次 probe / test / working / final 分支；
- 不把 `presignedAssetUrl` 长期留在仓库。

不要因为状态不确定，又重新创建同一个 importer。

---

## 13. 最终检查表

```text
[ ] 已先读取本文件
[ ] 已筛选真实原图并排除参考图 / 缩略图 / 重复副本
[ ] 已记录 candidateCount
[ ] 每张人物图 category 按实际服装主色确定
[ ] 未使用标题 / 场景关键词正则自动猜颜色
[ ] 每张图 title / tags 已准备
[ ] 每张图 original 或高质量 reconstructed prompt 已准备
[ ] reconstructed prompt 不只是标题 + category + 通用模板
[ ] Adobe 已初始化
[ ] 第一张 bridge 预检成功
[ ] 全批次取得 image/* presignedAssetUrl
[ ] 只创建一个一次性 importer
[ ] 原图 MIME / size / SHA-256 / sharp 校验成功
[ ] SHA-256 批内去重完成
[ ] data/gallery.json v3 已更新
[ ] data/prompt-index.json 已更新
[ ] prompt 文件已写入
[ ] candidate / bridged / downloaded / unique / existing / added / prompt 数量已核对
[ ] npm run build 成功
[ ] 正式入库 commit 已进入 main
[ ] 正式 commit 出现后没有重新创建 importer
[ ] pages.yml 已显式 dispatch
[ ] Pages 状态使用“已触发 / 已成功 / 未验证”准确表述
[ ] 一次性 workflow / trigger / 无用分支已清理
```

## 核心原则

1. **先读项目规则，不重新发明上传方案。**
2. **Adobe 文件桥只解决原始二进制传输，不负责素材语义理解。**
3. **人物颜色分类看实际服装主色，不看背景和场景关键词。**
4. **逐图 metadata 和 prompt 在 importer 运行前准备完成。**
5. **reconstructed prompt 必须建立在图片实际内容上，不能是标题模板。**
6. **`data/gallery.json` 是 v3 素材真源。**
7. **批量导入必须核对 candidate / unique / added / prompt 数量。**
8. **Importer 必须幂等，但正式 import commit 出现后绝不主动重跑。**
9. **bot push 后显式 dispatch `pages.yml`。**
10. **仓库入库成功、Pages 已触发、Pages 已发布必须分开表述。**
