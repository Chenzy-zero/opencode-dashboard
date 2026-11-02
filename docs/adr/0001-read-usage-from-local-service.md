# 用量只从 OpenCode 本地服务读取

Go 用量有三条获取路径：本地服务 `GET /api/experimental/usage/limits`、远端 `GET https://opencode.ai/zen/go/v1/usage`、以及读 `opencode.db` 自己实现刷新。我们只用本地服务，因为它是唯一已经处理了 OAuth 刷新与 org 作用域的路径（实测裸 token 打远端返回 403），且不需要我们在磁盘上保管任何凭据。

代价是：OpenCode 桌面端没运行时工具拿不到数据，只能显示离线态。这个代价被接受。

数据来源：`~/.local/state/opencode/service.json` 的 `url` 与 `password`，HTTP Basic 认证（用户名 `opencode`）。该文件含明文密码，不复制、不记录、不打日志。

**Considered Options**: 远端 `/zen/go/v1/usage`（需要自己实现 token 刷新，且对裸 token 返回 403）；直读 `opencode.db` 取凭据（同样要自己刷新，且深入非公开 schema）。
