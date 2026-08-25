# Cloudflare R2 Shadow Copy

本阶段只准备“影子复制”清单，不改变现有图库下载方式，也不删除 GitHub 原图。

## 目标

第一阶段默认只迁移人物图片原图：

```text
GitHub images/...  --copy-->  Cloudflare R2 private bucket
        |
        +-- 原图继续保留
```

R2 对象 key 使用稳定图片 ID，而不是目录名：

```text
originals/character/<assetId>.<ext>
```

这样以后即使 GitHub 中移动图片目录，R2 对象地址也不需要变化。

## 生成清单

只检查文件数量和体积，不写文件：

```bash
npm run prepare-r2-shadow
```

生成正式清单并计算 SHA-256：

```bash
npm run prepare-r2-shadow -- --hash --write
```

输出：

```text
data/r2-shadow-manifest.json
```

每个对象包含：

- `assetId`
- `sourcePath`
- `r2Key`
- `bytes`
- `contentType`
- `sha256`（使用 `--hash` 时）

## 安全规则

- 默认只处理 `character`
- 默认 dry-run
- 脚本没有上传和删除能力
- `deleteSourceAfterCopy` 固定为 `false`
- R2 上传完成后必须按对象数量、字节数和 SHA-256 校验
- 校验通过后也暂时不删除 GitHub 原图

## 后续阶段

真正的 R2 bucket 创建、上传和 Worker 下载鉴权必须放在独立 PR/部署阶段。

只有当以下链路全部验证完成后，才进入“隐藏公开原图”阶段：

1. R2 private bucket 正常
2. 所有目标对象上传完整
3. SHA-256 校验一致
4. Worker 下载鉴权正常
5. 支付测试正常

在此之前 `data/commerce.json` 必须继续保持 `enabled: false`。
