# Secure Env Helper 中文说明

[English README](./README.md)

用于在工作区内触发 `flutter_secure_dotenv` 生成流程的 VS Code 扩展。

它主要解决下面几类重复记忆成本：

- 哪个 `tool/*secure_env*.json` 配置文件对应哪个项目
- 当前项目应该执行什么命令
- 当前项目应该使用 `fvm flutter` 还是直接使用 `flutter`

这个扩展主要提供四项能力：

1. 在当前工作区中发现 secure env 配置文件
2. 根据当前激活文件或右键选中的资源，解析最近的匹配配置
3. 通过 `flutter` 或 `fvm flutter` 运行 `flutter_secure_dotenv_generator`
4. 将执行日志输出到 `Secure Env Generator` 输出面板

## 快速使用

打开任意相关文件：

- `.env.*`
- `.env.*.example`
- `*_env.dart`
- `tool/*secure_env*.json`

然后使用以下任一入口：

- 编辑器标题栏操作
- 编辑器右键菜单
- 资源管理器右键菜单
- `Secure Env: Generate For Current Project`

扩展会为该文件解析对应的配置，并在正确的项目目录下执行生成。

只要嵌套 Flutter 项目的配置文件能匹配 `secureEnvGenerator.configGlobs`，在当前工作区内也可以被正确发现和使用。

## 可用命令

- `Secure Env: Generate For Current Project`
- `Secure Env: Pick Config And Generate`
- `Secure Env: Open Config`
- `Secure Env: Show Output`

## 预期配置格式

扩展遵循现有 Flutter 工作区中已经使用的生成器契约，配置示例如下：

```json
{
  "displayName": "internal upload probe secure env",
  "envFile": ".env.internal_upload_probe",
  "envExampleFile": ".env.internal_upload_probe.example",
  "envDartFile": "lib/internal_upload_probe/internal_upload_probe_env.dart",
  "outputKeyFile": "encryption_key.json",
  "useFvm": "Auto"
}
```

## 工作区契约

扩展会自行执行生成流程，但宿主工作区仍然需要提供：

- `tool/*secure_env*.json` 风格的配置文件
- 包含 `_encryptionKey` 和 `_iv` 的 Dart env 文件
- 已为 `build_runner` 配置好的 `flutter_secure_dotenv_generator`
- `flutter` 或 `fvm`

扩展仍然通过以下设置发现配置文件：

- `secureEnvGenerator.configGlobs`

如果某个已发现的配置文件无法加载，warning 和输出面板会直接显示具体异常，而不再只提示“没有找到配置”。

现在已经不再依赖工作区内自定义的 PowerShell 脚本。

## 本地开发

```bash
npm install
npm run compile
npm run watch
```

在 VS Code 中按 `F5`，即可启动 Extension Development Host。

## 打包

```bash
npm install
npm run compile
npm run package
```

如需在发布前执行预发布编译，也可以运行：

```bash
npm run vscode:prepublish
```

## 发布说明

当前仓库仍按本地或私有用途配置：

- `publisher` 仍然是 `local`
- `license` 仍然是 `UNLICENSED`
- `package.json` 中的仓库信息目前只用于打包和 README 相对链接重写

如果要发布到 Marketplace，请先补齐这些字段。
