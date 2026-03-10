# Example Workspace

This folder is a minimal Flutter fixture for manual testing of `secure-env-helper`.

## What It Contains

- `tool/secure_env.json`: config discovered by the extension
- `.env.secure_demo.example`: plain-text input used to bootstrap `.env.secure_demo`
- `lib/secure_env/example_secure_env.dart`: annotated Dart env file with placeholder secrets
- `lib/main.dart`: tiny app that reads the generated env values

## Expected First-Run Behavior

When you run `Secure Env: Generate For Current Project` on any related file in this folder, the extension should:

1. create `.env.secure_demo` from `.env.secure_demo.example`
2. run `flutter pub run build_runner build --delete-conflicting-outputs`
3. generate `lib/secure_env/example_secure_env.g.dart`
4. generate and then remove `encryption_key.json`
5. replace `_encryptionKey` and `_iv` in `lib/secure_env/example_secure_env.dart`

## Manual Test Flow

1. Run `flutter pub get` inside `example/`.
2. Launch the extension with `F5`.
3. In the Extension Development Host, open one of these files:
   - `example/tool/secure_env.json`
   - `example/.env.secure_demo.example`
   - `example/lib/secure_env/example_secure_env.dart`
4. Run `Secure Env: Generate For Current Project`.
5. Check the `Secure Env Generator` output channel.

## Notes

- `.env.secure_demo`, `encryption_key.json`, and generated `*.g.dart` files are gitignored.
- `useFvm` is set to `Auto`, so the extension can use `fvm flutter` or `flutter`.
