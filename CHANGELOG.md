# Changelog

## Unreleased

- Fixed nested workspace candidate loading so discovered `tool/*secure_env*.json` configs are resolved more reliably inside parent workspaces.
- Improved discovery failure diagnostics by surfacing the concrete config load error in notifications and the output channel.
- Added repository metadata so `npm run package` works with README relative links.

## 0.0.2 - 2026-03-10

- Extracted the extension into a standalone repository scaffold.
- Added resource-aware generation from `.env.*`, `.env.*.example`, `*_env.dart`, and `tool/*secure_env*.json`.
- Added editor and explorer menu entry points for faster secure env generation.
- Added repository support files for local packaging and CI.
