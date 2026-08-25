# 收费功能分阶段上线与撤回

## 稳定恢复点

收费改造前的稳定恢复分支：

- `restore/pre-commerce-v1`
- commit: `cc2aa57fe7d5948059b9ab5ff4b9514e28af8e31`

这个分支只用于恢复，不承载后续开发。

## 总开关

收费配置位于 `data/commerce.json`。

默认状态：

```json
{
  "enabled": false,
  "originalDelivery": {
    "mode": "public",
    "provider": "github"
  }
}
```

`enabled=false` 时，现有图库行为保持不变。

构建脚本包含硬保护：只有同时满足以下条件才允许把收费总开关设为 `true`：

- `originalDelivery.mode = "private"`
- `originalDelivery.provider = "r2"`

这样可以避免页面已经收费、GitHub 原图却仍能公开下载的状态。

## 分阶段实施

### Phase 0 — Commerce foundation

- 增加 `commerce.json`
- 默认关闭收费
- 不改现有页面下载行为
- 不迁移原图

撤回：revert 本阶段提交即可。

### Phase 1 — R2 shadow copy

- Cloudflare R2 建立私有 bucket
- 原图从 GitHub **复制** 到 R2
- GitHub 原图仍保留
- 校验对象数量、大小和哈希

撤回：停止使用 R2；GitHub 原图仍可继续提供服务。

### Phase 2 — Private download API

- Cloudflare Worker 增加下载鉴权 API
- 仍不开启收费
- 管理员/测试身份验证 R2 下载链路

撤回：关闭 Worker 路由即可。

### Phase 3 — Alipay sandbox

- 创建订单
- 支付宝沙箱二维码
- notify 验签
- 订单状态查询
- entitlement 发放

撤回：关闭支付入口，保留订单测试数据。

### Phase 4 — Hide public originals

只有在 R2 下载和支付宝链路验证完成后才执行：

- Pages 构建不再发布原图
- GitHub 原图删除单独提交
- 公开页面仅保留缩略图/预览图

这是第一次真正改变原图公开状态的阶段，必须单独 PR。

### Phase 5 — Enable commerce

将 `data/commerce.json` 调整为：

```json
{
  "enabled": true,
  "originalDelivery": {
    "mode": "private",
    "provider": "r2"
  }
}
```

再启用付费 UI。

## 撤回优先级

出现问题时按最小影响范围处理：

1. 先把 `commerce.enabled` 改回 `false`
2. 再关闭支付/下载 Worker 路由
3. 再 revert 对应阶段 PR/commit
4. 需要完全恢复时，以 `restore/pre-commerce-v1` 为内容基线重新部署

已发生的真实支付订单、payment events 和 entitlement 不应因为代码撤回而删除，应保留审计记录。

## 原则

- 数据迁移先复制，后删除
- 每个阶段独立分支 / PR
- 支付密钥只放服务端 Secret
- 未完成私有原图链路前禁止开启收费
- 原图删除必须最后执行，而且单独提交
