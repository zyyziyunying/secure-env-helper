import * as fs from 'fs';
import * as path from 'path';
import { spawn, spawnSync } from 'child_process';
import * as vscode from 'vscode';

interface SecureEnvConfigFile {
  displayName?: string;
  envFile: string;
  envExampleFile?: string;
  envDartFile: string;
  outputKeyFile?: string;
  useFvm?: 'Auto' | 'Always' | 'Never';
}

interface SecureEnvCandidate {
  config: SecureEnvConfigFile;
  configUri: vscode.Uri;
  envFileUri: vscode.Uri;
  envExampleFileUri?: vscode.Uri;
  envDartFileUri: vscode.Uri;
  projectRootUri: vscode.Uri;
  sharedScriptUri: vscode.Uri;
  workspaceFolder: vscode.WorkspaceFolder;
  label: string;
  description: string;
  detail: string;
}

const LAST_CONFIG_KEY = 'secureEnvGenerator.lastConfigPath';
const outputChannel = vscode.window.createOutputChannel('Secure Env Generator');
let statusBarItem: vscode.StatusBarItem;
let generationInProgress = false;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    90,
  );
  statusBarItem.text = '$(shield) Secure Env';
  statusBarItem.command = 'secureEnvGenerator.generateNearest';
  statusBarItem.show();

  context.subscriptions.push(
    outputChannel,
    statusBarItem,
    vscode.commands.registerCommand('secureEnvGenerator.generateNearest', async (resource: unknown) => {
      await runGenerateCommand(context, {
        preferNearest: true,
        targetUri: getCommandTargetUri(resource),
      });
    }),
    vscode.commands.registerCommand('secureEnvGenerator.generate', async (resource: unknown) => {
      await runGenerateCommand(context, {
        preferNearest: false,
        targetUri: getCommandTargetUri(resource),
      });
    }),
    vscode.commands.registerCommand('secureEnvGenerator.openConfig', async (resource: unknown) => {
      const candidate = await pickCandidate(context, {
        preferNearest: true,
        targetUri: getCommandTargetUri(resource),
      });
      if (!candidate) {
        return;
      }

      await openUri(candidate.configUri);
    }),
    vscode.commands.registerCommand('secureEnvGenerator.showOutput', () => {
      outputChannel.show(true);
    }),
    vscode.window.onDidChangeActiveTextEditor(async () => {
      await updateStatusBar(context);
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await updateStatusBar(context);
    }),
  );

  await updateStatusBar(context);
}

export function deactivate(): void {}

async function runGenerateCommand(
  context: vscode.ExtensionContext,
  options: { preferNearest: boolean; targetUri?: vscode.Uri },
): Promise<void> {
  const candidate = await pickCandidate(context, options);
  if (!candidate) {
    return;
  }

  try {
    await runGenerator(context, candidate);
  } catch {
    return;
  }

  await updateStatusBar(context);
}

async function updateStatusBar(
  context: vscode.ExtensionContext,
): Promise<void> {
  const candidate = await resolveNearestCandidate(
    context,
    false,
    vscode.window.activeTextEditor?.document.uri,
  );
  if (candidate) {
    statusBarItem.text = `$(shield) Secure Env: ${candidate.label}`;
    statusBarItem.tooltip = [
      `Generate secure env for ${candidate.label}`,
      candidate.description,
      candidate.detail,
    ].join('\n');
    statusBarItem.command = 'secureEnvGenerator.generateNearest';
    statusBarItem.show();
    return;
  }

  statusBarItem.text = '$(shield) Secure Env';
  statusBarItem.tooltip = 'Pick a secure env config and run generation';
  statusBarItem.command = 'secureEnvGenerator.generate';
  statusBarItem.show();
}

async function pickCandidate(
  context: vscode.ExtensionContext,
  options: { preferNearest: boolean; targetUri?: vscode.Uri },
): Promise<SecureEnvCandidate | undefined> {
  const candidates = await discoverCandidates();
  if (candidates.length === 0) {
    void vscode.window.showErrorMessage(
      'No secure env config files were found. Expected files like tool/secure_env.json or tool/*secure_env*.json.',
    );
    return undefined;
  }

  const targetUri = options.targetUri ?? vscode.window.activeTextEditor?.document.uri;
  if (options.preferNearest && targetUri) {
    const nearest = findNearestCandidate(candidates, targetUri);
    if (nearest) {
      return nearest;
    }
  }

  const lastConfigPath = context.workspaceState.get<string>(LAST_CONFIG_KEY);
  if (options.preferNearest && lastConfigPath) {
    const lastCandidate = candidates.find(
      (candidate) => normalizeFsPath(candidate.configUri.fsPath) === normalizeFsPath(lastConfigPath),
    );
    if (lastCandidate) {
      return lastCandidate;
    }
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const picked = await vscode.window.showQuickPick(
    candidates.map((candidate) => ({
      label: candidate.label,
      description: candidate.description,
      detail: candidate.detail,
      candidate,
    })),
    {
      placeHolder: 'Select the secure env config to generate',
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );

  return picked?.candidate;
}

async function resolveNearestCandidate(
  context: vscode.ExtensionContext,
  showErrors: boolean,
  targetUri?: vscode.Uri,
): Promise<SecureEnvCandidate | undefined> {
  const candidates = await discoverCandidates(showErrors);
  if (targetUri) {
    const nearest = findNearestCandidate(candidates, targetUri);
    if (nearest) {
      return nearest;
    }
  }

  const lastConfigPath = context.workspaceState.get<string>(LAST_CONFIG_KEY);
  if (!lastConfigPath) {
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  return candidates.find(
    (candidate) => normalizeFsPath(candidate.configUri.fsPath) === normalizeFsPath(lastConfigPath),
  );
}

async function discoverCandidates(
  showErrors = true,
): Promise<SecureEnvCandidate[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (workspaceFolders.length === 0) {
    return [];
  }

  const seen = new Map<string, SecureEnvCandidate>();
  for (const workspaceFolder of workspaceFolders) {
    const configUris = await findConfigUris(workspaceFolder);
    for (const configUri of configUris) {
      try {
        const candidate = await loadCandidate(workspaceFolder, configUri);
        seen.set(normalizeFsPath(configUri.fsPath), candidate);
      } catch (error) {
        appendError(
          `Failed to load secure env config ${configUri.fsPath}: ${toErrorMessage(error)}`,
        );
        if (showErrors) {
          void vscode.window.showWarningMessage(
            `Failed to load secure env config: ${vscode.workspace.asRelativePath(configUri)}`,
          );
        }
      }
    }
  }

  return Array.from(seen.values()).sort((left, right) =>
    left.description.localeCompare(right.description),
  );
}

async function findConfigUris(
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<vscode.Uri[]> {
  const settings = getSettings();
  const exclude = '{**/.git/**,**/.dart_tool/**,**/build/**,**/node_modules/**}';
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
  const config = JSON.parse(Buffer.from(configContent).toString('utf8')) as SecureEnvConfigFile;

  if (!config.envFile || !config.envDartFile) {
    throw new Error('Config must include envFile and envDartFile.');
  }

  const projectRootPath = inferProjectRoot(configUri.fsPath);
  const projectRootUri = vscode.Uri.file(projectRootPath);
  const envFileUri = resolveProjectFileUri(projectRootPath, config.envFile);
  const envExampleFileUri =
    config.envExampleFile?.trim()
      ? resolveProjectFileUri(projectRootPath, config.envExampleFile)
      : undefined;
  const envDartFileUri = resolveProjectFileUri(projectRootPath, config.envDartFile);
  const sharedScriptUri = await resolveSharedScriptUri(workspaceFolder);
  if (!sharedScriptUri) {
    throw new Error(
      `Shared generator script was not found. Expected ${getSettings().sharedScriptRelativePath} from workspace root.`,
    );
  }

  const label = config.displayName?.trim() || path.basename(projectRootPath);
  const relativeConfigPath = vscode.workspace.asRelativePath(configUri, false);
  const detail = [
    `env: ${config.envFile}`,
    `dart: ${config.envDartFile}`,
    `config: ${relativeConfigPath}`,
  ].join(' | ');

  return {
    config,
    configUri,
    envFileUri,
    envExampleFileUri,
    envDartFileUri,
    projectRootUri,
    sharedScriptUri,
    workspaceFolder,
    label,
    description: relativeConfigPath,
    detail,
  };
}

async function resolveSharedScriptUri(
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<vscode.Uri | undefined> {
  const settings = getSettings();
  const primary = vscode.Uri.joinPath(
    workspaceFolder.uri,
    ...settings.sharedScriptRelativePath.split('/'),
  );
  if (fs.existsSync(primary.fsPath)) {
    return primary;
  }

  const fallback = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, '**/packages/common/tool/regenerate_secure_env.ps1'),
    '{**/.git/**,**/node_modules/**,**/.dart_tool/**,**/build/**}',
    1,
  );
  return fallback[0];
}

function inferProjectRoot(configPath: string): string {
  const configDir = path.dirname(configPath);
  if (path.basename(configDir).toLowerCase() === 'tool') {
    return path.dirname(configDir);
  }

  return configDir;
}

function findNearestCandidate(
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

async function runGenerator(
  context: vscode.ExtensionContext,
  candidate: SecureEnvCandidate,
): Promise<void> {
  if (generationInProgress) {
    outputChannel.appendLine(
      '[warn] Secure env generation is already running. Wait for the current run to finish.',
    );
    outputChannel.show(true);
    void vscode.window.showWarningMessage(
      'Secure env generation is already running. Wait for it to finish and check the output channel for progress.',
    );
    return;
  }

  const shellExecutable = resolveShellExecutable();
  if (!shellExecutable) {
    void vscode.window.showErrorMessage(
      'Neither pwsh nor powershell was found. Install PowerShell 7 or Windows PowerShell first.',
    );
    return;
  }

  const args = buildShellArgs(shellExecutable, candidate);
  const settings = getSettings();
  generationInProgress = true;

  outputChannel.appendLine('');
  outputChannel.appendLine(`=== ${new Date().toISOString()} ===`);
  outputChannel.appendLine(`Running secure env generation for: ${candidate.label}`);
  outputChannel.appendLine(
    `Command: ${shellExecutable} ${args.map((value) => quoteForLog(value)).join(' ')}`,
  );

  if (settings.autoOpenOutput) {
    outputChannel.show(true);
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Generating ${candidate.label}`,
      },
      async () => {
        await runProcess(shellExecutable, args, candidate.projectRootUri.fsPath);
      },
    );

    await context.workspaceState.update(LAST_CONFIG_KEY, candidate.configUri.fsPath);
    const action = await vscode.window.showInformationMessage(
      `Secure env generated: ${candidate.label}`,
      'Show Output',
      'Open Config',
    );

    if (action === 'Show Output') {
      outputChannel.show(true);
    } else if (action === 'Open Config') {
      await openUri(candidate.configUri);
    }
  } finally {
    generationInProgress = false;
  }
}

function buildShellArgs(
  shellExecutable: string,
  candidate: SecureEnvCandidate,
): string[] {
  const args = [
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    candidate.sharedScriptUri.fsPath,
    '-ProjectRoot',
    candidate.projectRootUri.fsPath,
    '-ConfigFile',
    candidate.configUri.fsPath,
  ];

  if (path.basename(shellExecutable).toLowerCase() === 'powershell.exe') {
    return args;
  }

  return args;
}

async function runProcess(
  executable: string,
  args: string[],
  cwd: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      windowsHide: true,
    });

    child.stdout.on('data', (chunk: Buffer | string) => {
      outputChannel.append(chunk.toString());
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      outputChannel.append(chunk.toString());
    });

    child.on('error', (error) => {
      appendError(`Failed to start secure env generator: ${toErrorMessage(error)}`);
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const error = new Error(`Secure env generator exited with code ${code ?? 'unknown'}.`);
      appendError(error.message);
      void vscode.window.showErrorMessage(error.message, 'Show Output').then((action) => {
        if (action === 'Show Output') {
          outputChannel.show(true);
        }
      });
      reject(error);
    });
  });
}

function resolveShellExecutable(): string | undefined {
  const settings = getSettings();
  if (process.platform === 'win32') {
    const preferred = settings.preferPwsh
      ? ['pwsh.exe', 'pwsh', 'powershell.exe', 'powershell']
      : ['powershell.exe', 'powershell', 'pwsh.exe', 'pwsh'];
    return preferred.find((candidate) => commandExists(candidate));
  }

  return ['pwsh', 'pwsh.exe'].find((candidate) => commandExists(candidate));
}

function commandExists(command: string): boolean {
  const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(lookup, [command], {
    encoding: 'utf8',
    windowsHide: true,
  });

  return result.status === 0;
}

function getSettings(): {
  configGlobs: string[];
  sharedScriptRelativePath: string;
  preferPwsh: boolean;
  autoOpenOutput: boolean;
} {
  const config = vscode.workspace.getConfiguration('secureEnvGenerator');
  return {
    configGlobs: config.get<string[]>('configGlobs', [
      '**/tool/secure_env.json',
      '**/tool/*secure_env*.json',
    ]),
    sharedScriptRelativePath: config.get<string>(
      'sharedScriptRelativePath',
      'packages/common/tool/regenerate_secure_env.ps1',
    ),
    preferPwsh: config.get<boolean>('preferPwsh', true),
    autoOpenOutput: config.get<boolean>('autoOpenOutput', true),
  };
}

async function openUri(uri: vscode.Uri): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, { preview: false });
}

function appendError(message: string): void {
  outputChannel.appendLine(`[error] ${message}`);
}

function quoteForLog(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function normalizeFsPath(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function getCommandTargetUri(resource: unknown): vscode.Uri | undefined {
  if (isUri(resource)) {
    return resource;
  }

  if (Array.isArray(resource)) {
    return resource.find((value): value is vscode.Uri => isUri(value));
  }

  return undefined;
}

function resolveProjectFileUri(projectRootPath: string, relativePath: string): vscode.Uri {
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

function isUri(value: unknown): value is vscode.Uri {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'scheme' in value &&
      'fsPath' in value &&
      'path' in value,
  );
}

function isPathInside(targetPath: string, parentPath: string): boolean {
  const normalizedTarget = normalizeFsPath(path.resolve(targetPath));
  const normalizedParent = normalizeFsPath(path.resolve(parentPath));
  return (
    normalizedTarget === normalizedParent ||
    normalizedTarget.startsWith(`${normalizedParent}${path.sep}`)
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
