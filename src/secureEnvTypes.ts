import * as vscode from "vscode";

export type UseFvm = "Auto" | "Always" | "Never";

export interface SecureEnvConfigFile {
  displayName?: string;
  envFile: string;
  envExampleFile?: string;
  envDartFile: string;
  outputKeyFile?: string;
  useFvm?: UseFvm | string;
}

export interface SecureEnvCandidate {
  config: SecureEnvConfigFile;
  configUri: vscode.Uri;
  envFileUri: vscode.Uri;
  envExampleFileUri?: vscode.Uri;
  envDartFileUri: vscode.Uri;
  projectRootUri: vscode.Uri;
  workspaceFolder: vscode.WorkspaceFolder;
  label: string;
  description: string;
  detail: string;
  outputKeyFile: string;
  useFvm: UseFvm;
}

export interface SecureEnvSettings {
  configGlobs: string[];
  autoOpenOutput: boolean;
}

export interface EmbeddedGenerationResult {
  mode: "bootstrapped" | "generated";
}
