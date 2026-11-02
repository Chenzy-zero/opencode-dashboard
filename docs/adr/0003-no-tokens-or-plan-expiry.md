# 不显示已用 tokens 与套餐到期时间

最初的设计要求在详情面板里显示「当前已用 tokens」和「套餐过期时间」。调查后两项都不可得：Go 用量通道只返回 `percent`，额度绝对值不在任何响应里；`opencode.db` 无订阅表，本地 OpenAPI 与客户端二进制里也搜不到 plan/expiry 字段。容易被误用的近似值有三个，全部排除——`monthly.resetsAt` 是月窗口重置时间而非订阅到期；`credential.expires` 是 OAuth 令牌过期；Console 的 `/api/usage/summary` 是 org 级的绝对 token，但需要另一套 OAuth 凭据、按自选日期区间查询，并不对应套餐周期。

因此详情面板不显示这两项，也不显示它们的任何替代口径（例如本机会话 token 数），避免把口径不同的数字伪装成套餐数据。

**Consequences**: 用户若想知道订阅何时到期，只能去网页 Console；如果将来官方补上订阅元数据接口，这条 ADR 应当被推翻。
