import * as path from "path";

import * as vscode from "vscode";

import { getSettings } from "./secureEnvSettings";
import {
  SecureEnvCandidate,
  SecureEnvConfigFile,
  SecureEnvDiscoveryIssue,
  SecureEnvDiscoveryResult,
  UseFvm,
} from "./secureEnvTypes";

const DEFAULT_OUTPUT_KEY_FILE = "encryption_key.json";

export async function discoverCandidates(
  outputChannel: vscode.OutputChannel,
  showErrors = true,
): Promise<SecureEnvDiscoveryResult> {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (workspaceFolders.length === 0) {
    return { candidates: [], loadErrors: [] };
  }

  const seen = new Map<string, SecureEnvCandidate>();
  const loadErrors: SecureEnvDiscoveryIssue[] = [];
  for (const workspaceFolder of workspaceFolders) {
    const configUris = await findConfigUris(workspaceFolder);
    for (const configUri of configUris) {
      try {
        const candidate = await loadCandidate(workspaceFolder, configUri);
        seen.set(normalizeFsPath(configUri.fsPath), candidate);
      } catch (error) {
        const displayPath = getWorkspaceRelativePath(workspaceFolder, configUri);
        const errorMessage = toErrorMessage(error);
        appendError(
          outputChannel,
          `Failed to load secure env config ${configUri.fsPath}: ${errorMessage}`,
        );
        loadErrors.push({
          configUri,
          displayPath,
          errorMessage,
        });
        if (showErrors) {
          void vscode.window.showWarningMessage(
            `Failed to load secure env config ${displayPath}: ${errorMessage}`,
          );
        }
      }
    }
  }

  return {
    candidates: Array.from(seen.values()).sort((left, right) =>
      left.description.localeCompare(right.description),
    ),
    loadErrors,
  };
}

export function findNearestCandidate(
  candidates: SecureEnvCandidate[],
  targetUri: vscode.Uri,
): SecureEnvCandidate | undefined {
  const targetPath = normalizeFsPath(targetUri.fsPath);
  const exactMatch = candidates.find((candidate) =>
    isMatchingCandidateTarget(candidate, targetPath),
  );
  if (exactMatch) {
    return exactMatch;
  }

  const matches = candidates.filter((candidate) =>
    isPathInside(targetPath, candidate.projectRootUri.fsPath),
  );
  if (matches.length === 0) {
    return undefined;
  }

  return matches.sort(
    (left, right) =>
      normalizeFsPath(right.projectRootUri.fsPath).length -
      normalizeFsPath(left.projectRootUri.fsPath).length,
  )[0];
}

export function normalizeFsPath(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function findConfigUris(
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<vscode.Uri[]> {
  const settings = getSettings();
  const exclude = "{**/.git/**,**/.dart_tool/**,**/build/**,**/node_modules/**}";
  const seen = new Map<string, vscode.Uri>();

  for (const pattern of settings.configGlobs) {
    const uris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, pattern),
      exclude,
    );
    for (const uri of uris) {
      seen.set(normalizeFsPath(uri.fsPath), uri);
    }
  }

  return Array.from(seen.values());
}

async function loadCandidate(
  workspaceFolder: vscode.WorkspaceFolder,
  configUri: vscode.Uri,
): Promise<SecureEnvCandidate> {
  const configContent = await vscode.workspace.fs.readFile(configUri);
  const rawConfig = JSON.parse(
    Buffer.from(configContent).toString("utf8"),
  ) as SecureEnvConfigFile;
  const config = normalizeConfig(rawConfig);

  const projectRootPath = inferProjectRoot(configUri.fsPath);
  const projectRootUri = vscode.Uri.file(projectRootPath);
  const envFileUri = resolveProjectFileUri(projectRootPath, config.envFile);
  const envExampleFileUri = config.envExampleFile
    ? resolveProjectFileUri(projectRootPath, config.envExampleFile)
    : undefined;
  const envDartFileUri = resolveProjectFileUri(projectRootPath, config.envDartFile);
  const label = config.displayName?.trim() || path.basename(projectRootPath);
  const relativeConfigPath = getWorkspaceRelativePath(workspaceFolder, configUri);
  const detail = [
    `env: ${config.envFile}`,
    `dart: ${config.envDartFile}`,
    `config: ${relativeConfigPath}`,
  ].join(" | ");

  return {
    config,
    configUri,
    envFileUri,
    envExampleFileUri,
    envDartFileUri,
    projectRootUri,
    workspaceFolder,
    label,
    description: relativeConfigPath,
    detail,
    outputKeyFile: config.outputKeyFile ?? DEFAULT_OUTPUT_KEY_FILE,
    useFvm: parseUseFvm(config.useFvm),
  };
}

function normalizeConfig(config: SecureEnvConfigFile): SecureEnvConfigFile {
  const envFile = typeof config.envFile === "string" ? config.envFile.trim() : "";
  const envDartFile = typeof config.envDartFile === "string"
    ? config.envDartFile.trim()
    : "";
  const envExampleFile = typeof config.envExampleFile === "string"
    ? config.envExampleFile.trim()
    : undefined;
  const outputKeyFile = typeof config.outputKeyFile === "string"
    ? config.outputKeyFile.trim()
    : "";

  if (!envFile || !envDartFile) {
    throw new Error("Config must include envFile and envDartFile.");
  }

  return {
    ...config,
    envFile,
    envDartFile,
    envExampleFile: envExampleFile || undefined,
    outputKeyFile: outputKeyFile || DEFAULT_OUTPUT_KEY_FILE,
    useFvm: parseUseFvm(config.useFvm),
  };
}

function parseUseFvm(value: unknown): UseFvm {
  if (typeof value !== "string" || !value.trim()) {
    return "Auto";
  }

  const normalized = value.trim();
  switch (normalized) {
    case "Auto":
    case "Always":
    case "Never":
      return normalized;
    default:
      throw new Error(`Unsupported useFvm value: ${String(value)}`);
  }
}

function inferProjectRoot(configPath: string): string {
  const configDir = path.dirname(configPath);
  if (path.basename(configDir).toLowerCase() === "tool") {
    return path.dirname(configDir);
  }

  return configDir;
}

function getWorkspaceRelativePath(
  workspaceFolder: vscode.WorkspaceFolder,
  resourceUri: vscode.Uri,
): string {
  const relativePath = path.relative(
    workspaceFolder.uri.fsPath,
    resourceUri.fsPath,
  );
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return resourceUri.fsPath;
  }

  return relativePath.split(path.sep).join("/");
}

function resolveProjectFileUri(
  projectRootPath: string,
  relativePath: string,
): vscode.Uri {
  const absolutePath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(projectRootPath, relativePath);
  return vscode.Uri.file(path.normalize(absolutePath));
}

function isMatchingCandidateTarget(
  candidate: SecureEnvCandidate,
  targetPath: string,
): boolean {
  return [
    candidate.configUri.fsPath,
    candidate.envFileUri.fsPath,
    candidate.envExampleFileUri?.fsPath,
    candidate.envDartFileUri.fsPath,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => normalizeFsPath(value) === targetPath);
}

function isPathInside(targetPath: string, parentPath: string): boolean {
  const normalizedTarget = normalizeFsPath(path.resolve(targetPath));
  const normalizedParent = normalizeFsPath(path.resolve(parentPath));
  return (
    normalizedTarget === normalizedParent ||
    normalizedTarget.startsWith(`${normalizedParent}${path.sep}`)
  );
}

function appendError(
  outputChannel: vscode.OutputChannel,
  message: string,
): void {
  outputChannel.appendLine(`[error] ${message}`);
}
