# Secure Env Helper

[中文文档](./README.zh-CN.md)

VS Code extension for workspace-local `flutter_secure_dotenv` generation flows.

It removes the need to remember:

- which `tool/*secure_env*.json` file belongs to which project
- which command to run
- whether the project should use `fvm flutter` or plain `flutter`

The extension does four things:

1. discover secure env config files in the current workspace
2. resolve the nearest matching config for the active file or clicked resource
3. run `flutter_secure_dotenv_generator` through `flutter` or `fvm flutter`
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

The extension resolves the matching config for that file and runs generation for the right project.

Nested Flutter projects inside the current workspace are supported as long as their config files match `secureEnvGenerator.configGlobs`.

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

The extension executes the generation flow itself, but it still expects the host workspace to provide:

- `tool/*secure_env*.json` style config files
- a Dart env file containing `_encryptionKey` and `_iv`
- `flutter_secure_dotenv_generator` configured for `build_runner`
- `flutter` or `fvm`

The extension still discovers configs through:

- `secureEnvGenerator.configGlobs`

If a discovered config cannot be loaded, the warning and output channel include the concrete error instead of only reporting that no config was found.

No workspace-local PowerShell script is required anymore.

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
- repository metadata is present only to support packaging and README link rewriting

Set those fields before marketplace publication.
