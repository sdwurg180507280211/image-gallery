# 图片通过 Adobe 文件桥接入库 image-gallery

> 本文件是 `sdwurg180507280211/image-gallery` 当前唯一的图片入库操作手册。
>
> 只要任务涉及“把当前会话生成图、上传图或工作区图片写入 image-gallery”，第一步必须读取本文件。不要改走 Base64、Google Drive、聊天缩略图、预览 URL 或其他临时中转方案。

## 适用场景

将 ChatGPT 当前会话可访问的原始图片、image_gen / ChatGPT Images 生成图，或当前工作区可访问的原始图片，稳定写入 `sdwurg180507280211/image-gallery`。

默认入库域为 **人物图片**；只有明确属于医药会议 KV / 医疗主视觉时才写入 `medical-kv`。

整个流程必须明确区分：

1. Adobe 原图桥接成功；
2. GitHub 仓库入库成功；
3. GitHub Pages 发布已触发；
4. GitHub Pages 发布成功。

---

## 0. 当前唯一稳定链路

```text
读取本文件
        ↓
筛选本批次真正要入库的成品原图
        ↓
逐图确定 title / domain / category 或 organ / tags / prompt
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
MIME / 文件大小 / sharp 校验
        ↓
可选 SHA-256 完整性记录（仅校验传输，不用于去重）
        ↓
images/ 正式原图
        ↓
data/gallery.json v3
        ↓
prompts/assets/<id>.md + data/prompt-index.json
        ↓
批次数量与 ID / path 一致性校验
        ↓
npm run build
        ↓
正式 commit + git push main
        ↓
触发 pages.yml
        ↓
删除一次性 workflow / 临时触发文件
        ↓
确认仓库入库状态 + Pages 状态
```

真正的二进制传输通道是：

**原始图片 → Adobe 文件桥 → presignedAssetUrl → GitHub Actions curl → 仓库原图。**

GitHub connector 本身不直接承载几十 MB 的 Base64 图片。

### 0.1 不做图片重复检测

当前项目明确 **不做内容重复检测**，因此上传流程不要增加：

- SHA-256 内容去重；
- pHash / 感知哈希去重；
- 与现有 `gallery.json` 做内容相似度比对；
- “已上传过则自动跳过”的内容判断。

如果计算 SHA-256，只能用于确认 Adobe 下载后的文件字节完整、记录审计信息或排查传输异常，**不得把 SHA 当作去重条件**。

仍然必须防止结构性冲突：

- 新素材 `id` 不得与现有素材 ID 冲突；
- 新素材 `path` 不得覆盖现有素材路径；
- 批次数量必须与实际准备入库的成品数量一致。

这些属于索引安全检查，不属于图片内容去重。

### 0.2 Actions 只负责机械执行，不负责猜图片语义

一次性 importer 可以自动完成：

- 下载；
- MIME / size / sharp 文件校验；
- 可选 SHA-256 完整性记录；
- 写原图；
- 写已准备好的 metadata；
- 写已准备好的 prompt；
- `npm run build`；
- commit / push；
- Pages 触发。

但是 importer **不要**根据文件名正则、标题关键词或场景词临时猜：

- 人物服装主色；
- 人物身份特征；
- 动作、表情、姿态；
- 镜头、构图和光线；
- 医药 KV 的器官分类；
- reconstructed prompt 的具体内容。

这些语义信息必须在创建 importer 前，根据当前图片和可靠生成上下文准备完成。

---

## 1. 图片收集与批次清单

### 1.1 当前会话生成图

如果任务是“上传本会话生成的图片”，只收集真正的生成成品：

- 使用真实 `file_id` / 当前会话可访问的原始文件引用；
- 一次生成多张时，每张作为独立素材；
- 不使用聊天缩略图、截图或预览图代替原图；
- 不重新生成近似图替代缺失原图；
- 用户参考图、参考 ZIP、contact sheet、总览缩略图不要误当成生成成品。

这里的“筛选”只负责区分 **成品与参考材料**，不是做内容去重。

### 1.2 批量文件 / ZIP

如果输入是 ZIP：

1. 先解压并筛选实际成品图片；
2. 排除参考图、缩略图和非成品；
3. 保留原始 PNG / JPG / WebP，不为了上传主动降质；
4. 每张图片单独进入后续 Adobe bridge；
5. ZIP 本身不是图库资产，不提交到 `images/`。

先确定：

```text
candidateCount = 本批次明确要入库的成品原图数
```

最终新增数量应以成功写入并通过 build 的素材数量为准。

---

## 2. 入库前准备逐图 manifest

在创建一次性 workflow 前，为每张候选图准备确定的数据，而不是在 Actions 里临时推断。

人物图片推荐结构：

```json
{
  "order": 1,
  "sourceFileId": "file_...",
  "originalFileName": "example.png",
  "title": "素材标题",
  "domain": "character",
  "category": "blue",
  "tags": ["同一人物", "蓝色礼服", "海岸"],
  "characterId": "oriental-fashion-beauty",
  "seriesSlug": "session-2026-08-28",
  "promptKind": "reconstructed",
  "prompt": "逐图完整提示词"
}
```

人物最终路径遵循：

```text
images/<character>/<series>/<file>
```

构建会从目录自动推导 `characterId / seriesSlug / seriesId`；如果 manifest 显式提供与项目规则一致的值，也可以保留。

### 2.1 人物分类规则

人物 `category` 仍按人物服装主色归类：

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

优先级：

```text
实际图片视觉判断
> 当前生成上下文中的明确服装描述
> 可靠逐图 metadata
> 文件标题中的明确服装词
> 场景词 / 背景词（不得作为分类依据）
```

背景、花朵、建筑、天气、节日或灯光颜色不能代替服装主色。无法可靠判断时用 `other`，不要硬猜。

### 2.2 医药 KV 当前字段

医药 KV 最低结构：

```json
{
  "order": 1,
  "sourceFileId": "file_...",
  "originalFileName": "kv.png",
  "title": "素材标题",
  "domain": "medical-kv",
  "organ": "heart",
  "promptKind": "reconstructed",
  "prompt": "逐图完整提示词"
}
```

当前构建：

- **要求** `organ` 属于项目允许的器官分类；
- **不要求** `used`；
- **不要求**医药主色 `color` 字段。

不要再为新 KV 写入或维护“已使用 / 未使用”状态，也不要把主色作为构建硬字段。

---

## 3. 提示词必须同步入库

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

### 3.1 reconstructed prompt 最低质量要求

人物图尽量覆盖：

- 稳定人物身份锚点；
- 实际服装款式与主色；
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

如果当前图片可见，应根据实际图片重建，而不是仅根据文件名或 category 生成通用模板。

### 3.2 医药 KV prompt

医药 KV 没有原始逐字 prompt 时，可以使用：

```text
prompts/medical-kv-16x9-base.md
```

作为视觉母规范，再结合该图实际的医学主体、构图、留白、辅助元素、光线、材质和实际色调生成 `reconstructed` prompt。

---

## 4. Adobe 初始化与桥接预检

### 4.1 初始化

同一会话第一次调用 Adobe 工具前执行：

```text
Adobe.adobe_mandatory_init
```

如果初始化失败，包括 MCP transport probe 返回 401 / 403 / 5xx，**立即停止本批次**。不要在 Adobe 初始化失败的情况下创建 importer 或修改 `main`。

同一会话已经成功初始化过时，不重复初始化。

### 4.2 第一张预检

先取候选图片中的第一张调用：

```text
Adobe.asset_openai_file_upload
```

成功条件：

- 返回 `assetId`；
- 返回 `presignedAssetUrl`；
- 返回 `mediaType`；
- `mediaType` 以 `image/` 开头。

第一张预检成功后，再批量桥接剩余图片。

### 4.3 硬失败规则

出现以下任一情况，停止本批次并明确报告原因：

- Adobe 初始化失败；
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

Adobe 故障与 GitHub 入库是两个阶段。Adobe 尚未成功桥接原图时，不应产生 importer、图片提交或临时上传分支污染。

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
预先确定的 title / domain / category 或 organ / tags / promptKind / prompt
最终 GitHub path
最终 asset id
```

`presignedAssetUrl` 只作为本次传输的临时下载地址，不长期写入图库元数据或正式 manifest。

---

## 6. GitHub 一次性导入 workflow

每个批次只创建 **一个** 一次性导入 workflow。

不要为同一批次反复创建 `probe / test / working / final` 等多个 importer，也不要创建多个平行上传分支。

### 6.1 workflow 职责

一次性 importer 只消费已经准备好的 manifest，并负责：

1. Checkout `main`；
2. 设置 Node.js 20；
3. 安装依赖；
4. 使用 Adobe `presignedAssetUrl` 下载原图；
5. 校验 HTTP 状态、MIME、文件大小和 sharp 可读取性；
6. 可选记录 SHA-256 作为传输完整性信息，**不用于去重**；
7. 检查目标 ID 和 path 不会覆盖现有素材；
8. 写入 `images/`；
9. 更新 `data/gallery.json`；
10. 写入 prompt 文件并更新 `data/prompt-index.json`；
11. 检查本批次成功数量与 manifest 一致；
12. 运行 `npm run build`；
13. commit 并 push `main`；
14. 触发 Pages 发布。

### 6.2 importer 不应做的事

- 不做 SHA 内容去重；
- 不做 pHash / 图像相似度检测；
- 不用标题或场景词自动猜人物 category；
- 不生成或维护医药 KV `used` 字段；
- 不把 `presignedAssetUrl` 永久写进仓库；
- 不在 build 失败时继续 push。

---

## 7. 入库后校验

### 7.1 仓库状态

至少确认：

- 本批次计划数量 = 实际新增素材数量；
- 每张原图存在；
- 每个新 ID 在 `data/gallery.json` 中唯一；
- 每个新 path 唯一且文件存在；
- prompt 索引关联有效；
- `npm run build` 成功。

注意：这里检查的是 **ID / path / 文件存在性 / 数量一致性**，不是图片内容重复检测。

### 7.2 Pages 状态

不要把“push 成功”直接表述为“页面已经发布”。需要分别确认：

```text
仓库提交成功
→ Pages workflow 已触发
→ build job success
→ deploy job success
```

只有 deploy 成功后，才能明确说 Pages 发布成功。

---

## 8. 一次性 workflow 清理

导入完成后删除一次性 importer 和仅用于触发导入的临时文件。

正式仓库中长期保留的 workflow 应保持最小化；当前正常情况下主要是：

```text
.github/workflows/pages.yml
.github/workflows/keep-supabase-alive.yml
```

不要把一次性上传 workflow 长期留在 `main`。

---

## 9. 与其他项目规则的关系

当前构建和元数据规则以：

```text
docs/metadata-v2.md
scripts/build.mjs
```

为准。

本手册不得重新引入已经退役的规则，包括：

- 图片内容重复检测；
- pHash；
- SHA 内容去重；
- 医药 KV `used` 状态；
- 医药 KV `color` 硬字段；
- 已撤回的 commerce / R2 上传前提。

如果未来代码规则发生变化，应同时更新 `docs/metadata-v2.md` 与本手册，避免新的会话按旧文档执行。
