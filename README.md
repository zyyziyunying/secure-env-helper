# Secure Env Helper

VS Code extension for workspace-local `flutter_secure_dotenv` generation flows.

It removes the need to remember:

- which `tool/*secure_env*.json` file belongs to which project
- which command to run
- whether the project should use `pwsh`, `powershell`, `fvm flutter`, or plain `flutter`

The extension does four things:

1. discover secure env config files in the current workspace
2. resolve the nearest matching config for the active file or clicked resource
3. run a shared generator script
4. stream logs to the `Secure Env Generator` output channel

## Fast path

Open any related file:

- `.env.*`
- `.env.*.example`
- `*_env.dart`
- `tool/*secure_env*.json`

Then use either:

- the editor title action
- the editor context menu
- the explorer context menu
- `Secure Env: Generate For Current Project`

The extension resolves the matching config for that file and runs the shared generator for the right project.

## Commands

- `Secure Env: Generate For Current Project`
- `Secure Env: Pick Config And Generate`
- `Secure Env: Open Config`
- `Secure Env: Show Output`

## Expected config shape

The extension follows the shared generator contract already used in the originating Flutter workspace:

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

## Workspace contract

By default the extension expects the host workspace to expose a shared script at:

```text
packages/common/tool/regenerate_secure_env.ps1
```

If your workspace uses a different path, override:

- `secureEnvGenerator.sharedScriptRelativePath`
- `secureEnvGenerator.configGlobs`

The actual generate/build logic stays in the host workspace. This repository only contains the VS Code integration layer.

## Local development

```bash
npm install
npm run compile
```

Then press `F5` in VS Code to launch an Extension Development Host.

## Packaging

```bash
npm install
npm run compile
npm run package
```

## Publish note

This repository is currently configured for local/private use:

- `publisher` is still `local`
- `license` is still `UNLICENSED`
- no public repository URL is baked into `package.json` yet

Set those fields before marketplace publication.
