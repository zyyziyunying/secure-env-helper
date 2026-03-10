# Embedded Generator Notes

## Goal

Record the current behavior of the shared workspace script and outline what needs to move into the extension if generation is embedded instead of delegated to `packages/common/tool/regenerate_secure_env.ps1`.

Source script reviewed:

- `D:\dev\flutter_code\harrypet_flutter\packages\common\tool\regenerate_secure_env.ps1`

## Current Extension Boundary

Today the extension only does VS Code integration:

- discover `tool/secure_env.json` files
- resolve the nearest matching config for the active file
- run the shared PowerShell script
- stream process output into the extension output channel

The actual generation flow is still implemented by the workspace script.

## What The PowerShell Script Actually Does

The script is an orchestration layer around `flutter_secure_dotenv_generator`, not a standalone generator implementation.

### 1. Merge CLI parameters with config JSON

It reads values from `secure_env.json` and allows explicit CLI parameters to override them.

Important config fields:

- `displayName`
- `envFile`
- `envExampleFile`
- `envDartFile`
- `outputKeyFile`
- `useFvm`

### 2. Resolve toolchain

It chooses how to invoke Flutter:

- `useFvm = Always`: require `fvm`, then run `fvm flutter ...`
- `useFvm = Never`: require `flutter`, then run `flutter ...`
- `useFvm = Auto`: prefer `fvm flutter`, otherwise fall back to `flutter`

### 3. Bootstrap missing `.env`

If `envFile` does not exist and `envExampleFile` exists, it copies the example file into place before generation.

### 4. Read secrets from the Dart env file

It expects the annotated Dart env file to contain:

- `static const _encryptionKey = '...'`
- `static const _iv = '...'`

If either constant is missing, the script fails with an explicit error.

### 5. Detect whether keys need bootstrapping

It treats the following values as placeholders or missing values:

- `YOUR_BASE64_ENCRYPTION_KEY`
- `YOUR_BASE64_IV`
- `YOUR_ENCRYPTION_KEY`
- `YOUR_IV`
- `<AUTO_GENERATE>`
- `AUTO_GENERATE`

It also supports forced rotation through `-RotateKeys`.

### 6. Run build_runner

It executes:

- `flutter pub run build_runner build --delete-conflicting-outputs`

or:

- `fvm flutter pub run build_runner build --delete-conflicting-outputs`

It passes `--define` values for:

- `OUTPUT_FILE`
- optionally `ENCRYPTION_KEY`
- optionally `IV`

### 7. Bootstrap secrets when needed

If the Dart file still contains placeholders, the script:

1. runs build_runner without passing existing key material
2. expects a temporary JSON file such as `encryption_key.json`
3. reads `ENCRYPTION_KEY` and `IV` from that JSON file
4. writes them back into the Dart env file
5. deletes the temporary JSON file
6. stops after bootstrap success

### 8. Run normal regeneration

If valid `_encryptionKey` and `_iv` already exist, the script passes them into build_runner and performs normal regeneration.

After success, it deletes the temporary key JSON file if it exists.

## What "Embed In The Extension" Really Means

Embedding the generator into the extension does not remove the Flutter toolchain dependency.

It removes:

- dependency on a workspace-local PowerShell script
- dependency on PowerShell as the orchestration runtime

It does not remove:

- dependency on `flutter_secure_dotenv_generator`
- dependency on `flutter` or `fvm flutter`
- dependency on the workspace project structure and env config files

## Recommended Migration Shape

Re-implement the PowerShell orchestration logic in TypeScript inside the extension.

Suggested responsibilities:

1. Parse `secure_env.json`.
2. Resolve project-relative paths.
3. Choose `fvm flutter` or `flutter`.
4. Ensure `.env` exists, using `.env.example` when available.
5. Read `_encryptionKey` and `_iv` from the Dart env file.
6. Detect placeholder values and bootstrap when needed.
7. Invoke `build_runner` with the required `--define` values.
8. Update the Dart env file with generated key material.
9. Clean up the temporary key JSON file.

## Settings Impact

If generation is embedded, these settings likely become unnecessary:

- `secureEnvGenerator.sharedScriptRelativePath`
- `secureEnvGenerator.preferPwsh`

These settings remain relevant:

- `secureEnvGenerator.configGlobs`
- `secureEnvGenerator.autoOpenOutput`

## Suggested Follow-Up Implementation Notes

- Add a small internal service module instead of keeping all logic in `src/extension.ts`.
- Keep subprocess execution and output streaming inside the extension output channel.
- Preserve the existing config contract so host workspaces do not need to rewrite `secure_env.json`.
- Consider adding an explicit rotate-keys command if `-RotateKeys` behavior is still needed after migration.

## Open Questions

- Should the extension support key rotation as a first-class command?
- Should bootstrap automatically continue into a full regenerate after writing new secrets, or keep the current stop-after-bootstrap behavior?
- Should the extension validate the Dart env file structure more strictly before running build_runner?
