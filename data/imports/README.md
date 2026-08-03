# 导入 manifest 规范

每个图片生成窗口完成视觉复核后，在此目录提交一份 manifest。manifest 只描述该窗口负责的图片，不自行修改全局分类词表。

推荐文件名：

```text
<source-chat-slug>-manifest.json
```

最低字段：

```json
{
  "schemaVersion": 2,
  "sourceChat": "会话名称",
  "generatedAt": "2026-08-03T00:00:00Z",
  "summary": {
    "discovered": 0,
    "classified": 0,
    "alreadyExists": 0,
    "duplicates": 0,
    "needsReview": 0
  },
  "records": [
    {
      "sourceFileId": "file_...",
      "generationSequence": 1,
      "sourceSha256": "...",
      "repositoryPath": "images/.../image.png",
      "metadataPath": "images/.../image.json",
      "id": "固定 ID",
      "character": "红裳仙姬",
      "theme": ["portrait"],
      "scene": [],
      "palette": ["crimson-gold"],
      "composition": ["single-image", "close-up"],
      "assetType": "artwork",
      "actions": [],
      "expressions": [],
      "confirmedTraits": [],
      "status": "classified",
      "reviewNotes": ""
    }
  ]
}
```
