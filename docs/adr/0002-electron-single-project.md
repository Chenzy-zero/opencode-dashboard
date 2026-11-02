# Electron + 单一工程，macOS 先行

macOS 与 Windows 都要支持，但先做 macOS。选 Electron + TypeScript，而不是原生 Swift 或 Tauri：这台机器上 Swift 只有 Command Line Tools（无 Xcode，`xcodebuild` 不可用），原生路线得靠 SPM 手工拼 `.app`，构建链路的坑大于功能收益；Rust 未安装，Tauri 出局；Node 24 已在位，Electron 开箱可用。Windows 版后续复用同一套工具链。

「两套开发」指发布节奏与平台适配分两步走，不是两份代码：一个工程，平台差异收进适配层（托盘图标绘制、窗口置顶/透明、开机自启），避免把两三百行核心逻辑维护两遍。

**Consequences**: 常驻内存约 100MB、安装包约 100MB，对一个「看数字」的工具偏重；换来的是两端一致的窗口/托盘行为与更快的迭代。
