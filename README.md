# Image Gallery

一个专门用于整理、浏览和展示生成式人物模型图片的通用静态网站。项目名称和界面不绑定任何具体角色，可以长期存放不同人物、主题与系列的作品。

## 功能

- 响应式图片网格，适配电脑、平板和手机
- 按第一层图片文件夹自动分类
- 按更深层文件夹自动生成标签
- 标题、分类、标签和描述全文搜索
- 最新、最早和标题排序
- 浏览器本地收藏
- 明暗主题切换
- 全屏灯箱、上一张/下一张和键盘导航
- 原图下载
- GitHub Actions 自动扫描图片并生成索引
- GitHub Pages 自动部署，无需数据库和服务器

## 在线地址

GitHub Pages 构建成功后访问：

```text
https://sdwurg180507280211.github.io/image-gallery/
```

## 上传图片

直接把图片放进 `images/`。推荐按“角色 / 主题”组织：

```text
images/
├── character-a/
│   ├── portrait/
│   │   ├── close-up-01.png
│   │   └── close-up-02.webp
│   └── action/
│       └── battle-pose-01.jpg
└── character-b/
    └── casual-01.png
```

第一层文件夹会显示为分类，更深层文件夹会显示为标签。支持：

```text
png / jpg / jpeg / webp / gif / avif
```

图片推送到 `main` 分支后，工作流会自动执行：

1. 扫描 `images/` 中的图片。
2. 生成 `data/gallery.json`。
3. 构建并发布 GitHub Pages。

详细的图片说明和同名 JSON 元数据写法见 [`images/README.md`](./images/README.md)。

## 自定义图片信息

图片旁可放置同名 JSON，例如：

```text
images/character-a/portrait/rain-night.png
images/character-a/portrait/rain-night.json
```

```json
{
  "title": "雨夜回眸",
  "description": "雨夜霓虹环境下的角色上半身特写。",
  "category": "角色 A",
  "tags": ["雨夜", "特写", "霓虹"],
  "createdAt": "2026-07-24T18:00:00+09:00",
  "featured": true,
  "width": 2048,
  "height": 3072
}
```

所有字段均可省略。未提供 JSON 时，会根据文件夹和文件名自动生成展示信息。

## 本地预览

需要 Node.js 20 或更高版本：

```bash
git clone https://github.com/sdwurg180507280211/image-gallery.git
cd image-gallery
npm run generate
npm run serve
```

打开：

```text
http://localhost:4173
```

## 项目结构

```text
image-gallery/
├── .github/workflows/pages.yml  # 自动生成索引并部署 Pages
├── assets/
│   ├── app.js                   # 搜索、筛选、收藏和灯箱
│   └── styles.css               # 响应式视觉样式
├── data/gallery.json            # 图片索引
├── images/                      # 图片与可选同名元数据
├── scripts/generate-gallery.mjs # 自动索引脚本
├── index.html
└── package.json
```

## GitHub Pages

若仓库第一次使用 Pages，请在仓库的 **Settings → Pages → Build and deployment** 中把 Source 设为 **GitHub Actions**。之后每次上传图片都会自动更新网站。
