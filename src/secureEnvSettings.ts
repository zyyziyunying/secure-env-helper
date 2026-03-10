import * as vscode from "vscode";

import { SecureEnvSettings } from "./secureEnvTypes";

const DEFAULT_CONFIG_GLOBS = [
  "**/tool/secure_env.json",
  "**/tool/*secure_env*.json",
];

export function getSettings(): SecureEnvSettings {
  const config = vscode.workspace.getConfiguration("secureEnvGenerator");
  return {
    configGlobs: config.get<string[]>("configGlobs", DEFAULT_CONFIG_GLOBS),
    autoOpenOutput: config.get<boolean>("autoOpenOutput", true),
  };
}
