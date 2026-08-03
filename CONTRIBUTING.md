# 贡献指南

感谢你对 JMComic Desktop 感兴趣！无论是修 bug、加功能、改文档还是提建议，都欢迎参与。

## 开发环境

- Windows 10 / 11
- Node.js 18+ 与 npm

```powershell
npm install
npm run dev        # 开发模式：electron-vite + HMR
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式（Vite HMR + Electron） |
| `npm run build` | 生产构建 |
| `npm run package` | 打包便携版单文件 .exe |
| `npx tsx <测试文件>` | 运行单个单元测试 |

## 测试

项目使用手写 `test()` 辅助函数 + Node `assert`（无 vitest / jest），通过 `tsx` 直接运行：

```powershell
npx tsx src/main/__tests__/homepageLogic.test.ts
```

所有测试文件位于 `src/main/__tests__/`，进程以非零退出码表示失败。

**工程代码改动请遵循 TDD**：先写失败测试并看到失败，再写最小实现并看到通过。小改动（文案、文档、重命名）可跳过。

## 分支与提交规范

- 分支命名：`feat/<简述>` 或 `fix/<简述>`
- 提交信息用中文简要说明，遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：

```text
feat(reader): 章节预加载
fix(download): 修复重试后进度不刷新
docs: 更新架构文档
```

## 提交流程

1. Fork 本仓库并克隆到本地
2. 从 `main` 新建功能分支
3. 完成改动，补测试，确保 `npm run build` 与相关测试通过
4. 提交并推送到你的 Fork
5. 发起 Pull Request，描述改动动机、方案与验证结果

## 代码风格

- 保持既有风格：TypeScript strict、2 空格缩进、React 函数组件
- 主进程逻辑尽量拆成纯函数（便于单测），UI 组件尽量无状态化
- 不改无关文件，不留下注释掉的旧代码
- 新增图片 / 网络能力时同步更新 CSP（`src/renderer/index.html`）

## 发布流程

维护者打 `v*` tag 后，GitHub Actions 会自动构建并发布便携版 .exe 到 Releases，无需手动打包上传。
