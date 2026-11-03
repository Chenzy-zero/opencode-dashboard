# OpenCode Dashboard

OpenCode Go 订阅额度跟踪工具。常驻 macOS 菜单栏，直接显示 5 小时用量窗口的剩余额度，按危险程度变色；还可以打开置顶悬浮球，把同样的数字放进屏幕角落。

## 运行

```bash
npm install
npm run dev          # 启动菜单栏 app（electron-vite dev）
npm test             # node --test，跑契约测试与单测（需要先 package）
npm run build        # typecheck + 构建到 out/
npm run package      # 本地未签名 .app（electron-builder，输出 release/）
npm run install:app  # 构建（如需要）并安装到 /Applications
```

`npm run icons` 重新生成 `resources/trayTemplate.png`（1x/2x）；`npm run app-icon` 重新生成 `build/icon.icns`。

## 安装到 /Applications

```bash
npm run install:app
```

- 产物不存在时会先跑 `npm run package`，然后把 `release/mac/OpenCode Dashboard.app` 复制到 `/Applications/OpenCode Dashboard.app`；已有副本会被替换。
- `/Applications` 不可写时会直接失败并说明原因，不会留下半份安装。
- 安装完成后打开 Launchpad，搜索 `OpenCode Dashboard` 即可启动。本地构建的未签名 app 没有 quarantine 标记，双击不会被 Gatekeeper 拦截。
- 未签名构建无法可靠写入 macOS 登录项，所以「开机自启」仍不可用（菜单里的提示保持原样）。如果以后需要它真正生效，只能自行用 ad-hoc 方式重新签名；默认构建不会替你切换签名方式。

## 打包

```bash
npm run package    # → release/mac/OpenCode Dashboard.app
open "release/mac/OpenCode Dashboard.app"
```

- 未签名、不公证、不做自动更新检查（`electron-builder.yml` 里 `identity: null`、`notarize: false`，没有 `publish` 配置）。
- bundle id `com.chenzhiyong.opencode-dashboard`，显示名 `OpenCode Dashboard`；`LSUIElement: true` + 运行时 `accessory` 激活策略，不占 Dock、不出现在 ⌘-Tab。
- 产物内容只有 `out/**` 与 `package.json`（打包进 `app.asar`）：不含 `src/`、`test/`、`node_modules` 或本地服务的 `service.json`。
  `npm test` 会检查真实产物（Info.plist、权限声明、asar 文件清单、有没有把本地服务密码打进去）；没有 `release/mac/OpenCode Dashboard.app` 时会明确失败并提示先跑 `npm run package`，不会静默跳过。
- 占位应用图标由 `npm run app-icon` 生成，与托盘同款圆环；`scripts/after-pack.cjs` 会删掉 Electron 默认 Info.plist 里的相机/麦克风/蓝牙/音频采集用途声明——这个应用不调用那些 API，不该看起来像在申请权限。
- 开发与打包用的是同一个 userData 目录：`~/Library/Application Support/OpenCode Dashboard`。

## 开机自启

托盘右键菜单「开机自启」直接读写 macOS 登录项（SMAppService），每次打开菜单都重新读 `app.getLoginItemSettings()`，勾选态只反映系统实际状态。

- 开发模式（`npm run dev`）下该项是灰的：此时「应用」是 Electron.app，注册会把 Electron 自己加进登录项。
- 系统没接受写入时（未签名构建的已知问题，见研究笔记 §7），菜单里会多出一行「开机自启未能生效（未签名构建常见）」，不会留一个假的勾。
- 本机（macOS 14.8.9）实测：未签名构建写入后 `status` 始终是 `not-found`，ad-hoc 签名（`npx electron-builder --mac --x64 -c.mac.identity=-`）后立刻变成 `enabled`。默认构建仍保持未签名；需要开机自启真的生效时再考虑 ad-hoc，代价是每次重新打包签名都会变，可能要在菜单里重新开关一次。
- 诊断开关：`OPENCODE_DASHBOARD_LOGIN_PROBE=1 "release/mac/OpenCode Dashboard.app/Contents/MacOS/OpenCode Dashboard"`，会打印原始 `{openAtLogin,status}`、切换结果，并把状态还原。

人工验收步骤：`npm run install:app` 装到 `/Applications`（登录项绑定 bundle 路径，换路径后要重新开关）→ 菜单里打开「开机自启」→ 在「系统设置 › 通用 › 登录项」确认 → 注销或重启，看菜单栏是否自动出现。

## 结构

```
src/core/          纯逻辑，不 import electron，可用 node --test 直接测
  service.ts       读 ~/.local/state/opencode/service.json（url/password，每次现读）
  usage.ts         请求本地服务并把结果归类为 online/offline/unauthenticated/error
  types.ts         领域类型，以及首次轮询前的 loading 状态
  view-model.ts    剩余额度换算、取整、颜色分档、托盘文案、5 小时窗口摘要
  panel-view.ts    详情面板三行、重置倒计时/绝对时刻、刷新中标记
  refresh-scheduler.ts  60s 轮询、手动触发、唤醒触发的时钟
  refresh-runner.ts     串行化轮询，并在刷新中保留一次后续请求
  ball-view.ts     悬浮球的数字、圆环填充、倒计时与颜色档
  ball-position.ts 拖动吸附到最近屏幕边缘、多显示器还原/夹取
  panel-position.ts  面板相对托盘与屏幕工作区的位置计算
  geometry.ts      Rect/Size/Point 与 clamp，供面板与悬浮球共用
  ball-state.ts    悬浮球开关与位置的 JSON 解析/序列化
  login-item.ts    登录项状态的推导：勾选态、待批准、系统没接受（首版仅 macOS）
  updated-at.ts    「最后更新 N 分钟前」文案
src/main/          唯一 import electron 的外壳层
  index.ts         app 生命周期与接线：刷新调度、托盘、面板、悬浮球
  tray.ts          托盘创建、模板图标、标题颜色、点击切换面板
  tray-menu.ts     托盘右键菜单的纯数据模板
  login-item.ts    登录项读写（OS 走注入的 port，便于单测）
  panel.ts         无边框置顶面板窗口、失焦收起、250ms 防抖
  ball.ts          透明置顶悬浮球窗口、光标跟踪拖动、松手吸附、右键菜单
  preferences.ts   userData 下的状态文件读写（原子写入）
  dev.ts           仅开发/诊断用的冒烟与登录项探针
  log.ts           开发日志开关，打包后静默
src/shared/        纯类型：sandboxed renderer 与 preload 的 API 契约
src/preload/       contextBridge：面板视图/收起/重试，悬浮球视图/拖动/右键菜单
src/renderer/      面板与悬浮球两页 HTML/CSS/TS，只画主进程算好的纯数据
scripts/           托盘图标、应用图标、安装到 /Applications、打包后 Info.plist 清理
test/              node:test（Node 24 直接运行 .ts，无需编译）
```

- 数据源：`GET <url>/api/experimental/usage/limits`，HTTP Basic（用户名固定 `opencode`）。
- 凭据只在内存中使用：不写日志、不落盘、不进 UI。
- 显示的一律是**剩余额度** = `100 − 已用百分比`（取整）。
- 阈值：剩余 >20% 常规色，10–20% 黄色，<10% 红色；任一窗口 `limited` 也按红色；离线/未登录/异常为灰色 `—`。
- 详情面板：左键托盘图标开关，点外部或 Esc 收起；三行固定为 5 小时窗口、周窗口、月窗口；重置时间文案形如 `2 小时 13 分后 · 19:17`，超过 1 天省略分钟。
- 悬浮球：托盘右键菜单「显示悬浮球」开关（默认关闭），开关与位置存 `~/Library/Application Support/OpenCode Dashboard/ball-state.json`，重启恢复；无边框、透明、置顶、不占 Dock、不抢焦点；拖动松手后吸附到最近的屏幕边缘；单击打开详情面板，右键给出「立即刷新 / 隐藏 / 退出」；任一窗口限流时环与数字变红，非在线状态显示灰色 `—`。
- 托盘右键菜单固定为：显示悬浮球（勾选）、立即刷新、开机自启（勾选）、退出；开机自启未生效时多一行说明。
- 开发冒烟：`OPENCODE_DASHBOARD_SMOKE=1 npm run dev` 会依次走一遍托盘点击、手动刷新、面板重试、悬浮球开关与「球→面板」路径，并把悬浮球渲染结果截图到临时目录；拖动、吸附、右键菜单等指针交互仍需人工验收。
