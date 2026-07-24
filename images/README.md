# 图片目录

把生成的图片上传到此目录。推荐按“角色 / 主题”分层：

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

- 第一层文件夹会自动成为画廊分类。
- 更深层的文件夹名称会自动成为标签。
- 支持 `png`、`jpg`、`jpeg`、`webp`、`gif`、`avif`。
- 推送图片后，GitHub Actions 会自动重建索引并发布网站。

## 可选图片说明

需要自定义标题、介绍或标签时，在图片旁放置一个同名 JSON 文件。

例如：

```text
images/character-a/portrait/close-up-01.png
images/character-a/portrait/close-up-01.json
```

JSON 内容：

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

所有字段均可省略。没有 JSON 时，系统会从文件名和文件夹自动生成信息。
