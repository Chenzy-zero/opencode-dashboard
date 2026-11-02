# OpenCode Dashboard

OpenCode Go 订阅额度跟踪工具。常驻 macOS 菜单栏，直接显示 5 小时用量窗口的剩余额度，按危险程度变色。

## 运行

```bash
npm install
npm run dev        # 启动菜单栏 app（electron-vite dev）
npm test           # node --test，跑契约测试与单测
npm run build      # typecheck + 构建到 out/
npm run package    # 本地未签名 .app（electron-builder，输出 release/）
```

`npm run icons` 重新生成 `resources/trayTemplate.png`（1x/2x）。

## 结构

```
src/core/          纯逻辑，不 import electron，可用 node --test 直接测
  service.ts       读 ~/.local/state/opencode/service.json（url/password，每次现读）
  usage.ts         请求本地服务并把结果归类为 online/offline/unauthenticated/error
  view-model.ts    剩余额度换算、取整、颜色分档、托盘文案
  panel-view.ts    详情面板三行、重置倒计时/绝对时刻、最后更新时间
  panel-position.ts  面板相对托盘与屏幕工作区的位置计算
  types.ts         领域类型
src/main/          唯一 import electron 的外壳层
  index.ts         app 生命周期、启动刷新、60s 轮询、面板接线
  tray.ts          托盘创建、模板图标、标题颜色、点击切换面板
  panel.ts         无边框置顶面板窗口、失焦收起、250ms 防抖
src/preload/       contextBridge：只暴露面板视图订阅与收起
src/renderer/      面板 HTML/CSS/TS，只画主进程算好的纯数据
test/              node:test（Node 24 直接运行 .ts，无需编译）
```

- 数据源：`GET <url>/api/experimental/usage/limits`，HTTP Basic（用户名固定 `opencode`）。
- 凭据只在内存中使用：不写日志、不落盘、不进 UI。
- 显示的一律是**剩余额度** = `100 − 已用百分比`（取整）。
- 阈值：剩余 >20% 常规色，10–20% 黄色，<10% 红色；任一窗口 `limited` 也按红色；离线/未登录/异常为灰色 `—`。
- 详情面板：左键托盘图标开关，点外部或 Esc 收起；三行固定为 5 小时窗口、周窗口、月窗口；重置时间文案形如 `2 小时 13 分后 · 19:17`，超过 1 天省略分钟。
- 开发冒烟：`OPENCODE_DASHBOARD_SMOKE=1 npm run dev` 启动 2.5 秒后会走一遍托盘点击路径并打日志。
