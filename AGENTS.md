# 仓库指南

请先阅读 [README.md](./README.md)，了解产品概览、启动方式、开发命令、打包流程以及工作区契约。本文件面向贡献者，应聚焦于开发规范。

## 项目结构与模块组织
- `src/extension.ts`：扩展入口，以及命令与会话相关逻辑。
- `dist/`：TypeScript 编译输出目录。视为构建产物，不要手动编辑。
- `.github/workflows/ci.yml`：最小化 CI，用于安装、编译和打包校验。
- `.vscode/launch.json` 和 `.vscode/tasks.json`：用于 Extension Development Host 的本地调试与构建预设。

## 文档边界
- 将 `README.md` 作为启动方式、运行命令、打包步骤和工作区行为的唯一事实来源。
- 本文件只用于记录贡献者规则：代码组织、编码规范、验证范围和 PR 规范。

## 编码风格与命名约定
- 语言使用 TypeScript，并启用 `strict` 模式。
- 使用 2 空格缩进、分号和双引号。
- 保持函数小而聚焦单一行为。
- 除非是有意的破坏性变更，命令 ID 应保持在 `secureEnvGenerator.*` 命名空间下。

## 验证规范
- 当前还没有自动化单元测试。
- 提交行为变更前，需要完成编译、打包，并在 Extension Development Host 中做一次手动 smoke test。
- Smoke 测试应覆盖：
  - 编辑器当前文件触发生成
  - 资源管理器右键触发生成
  - 从 `.env.*`、`.env.*.example`、`*_env.dart` 和 `tool/*secure_env*.json` 解析配置

## 提交与拉取请求规范
- 优先使用 Conventional Commit 前缀，例如 `feat:`、`fix:`、`refactor:` 和 `chore:`。
- 如果可行，将打包或版本号变更与行为变更分开处理。
- PR 应包含目的、关键改动，以及实际执行过的验证命令。
