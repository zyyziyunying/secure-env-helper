# Repository Guidelines

## Project Structure & Module Organization
- `src/extension.ts`: extension entrypoint and command/session logic.
- `dist/`: compiled output from TypeScript. Treat as build artifacts; do not hand-edit.
- `.github/workflows/ci.yml`: minimal CI for install, compile, and package validation.
- `.vscode/launch.json` and `.vscode/tasks.json`: local debug and build presets for Extension Development Host.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run compile`: one-time TypeScript build to `dist/`.
- `npm run watch`: incremental TypeScript rebuild while developing.
- `npm run vscode:prepublish`: pre-publish compile step.
- `npm run package`: create a `.vsix` package for local install testing.
- In VS Code, press `F5` to launch an Extension Development Host.

## Coding Style & Naming Conventions
- Language: TypeScript with `strict` mode enabled.
- Use 2-space indentation, semicolons, and double quotes.
- Keep functions small and behavior-focused.
- Command IDs should remain under the `secureEnvGenerator.*` namespace unless there is a deliberate breaking change.

## Testing Guidelines
- There is no automated unit test suite yet.
- Minimum validation for every change:
  - `npm run compile`
  - `npm run package`
  - Manual smoke test in Extension Development Host for:
    - active editor generate
    - explorer right-click generate
    - config resolution from `.env.*`, `.env.*.example`, `*_env.dart`, and `tool/*secure_env*.json`

## Commit & Pull Request Guidelines
- Prefer Conventional Commit prefixes such as `feat:`, `fix:`, `refactor:`, and `chore:`.
- Keep packaging/version-bump changes separate from behavior changes when practical.
- PRs should include purpose, key changes, and the exact validation commands run.

## Workspace Contract
- This extension intentionally delegates generation logic to a script inside the host workspace.
- Keep the extension generic enough to point at different workspaces through settings, but do not reimplement the generator logic inside the extension unless that becomes an explicit product decision.
