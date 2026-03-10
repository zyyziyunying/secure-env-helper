import * as vscode from "vscode";

import { runEmbeddedGenerator } from "./embeddedGenerator";
import {
  discoverCandidates,
  findNearestCandidate,
  normalizeFsPath,
  toErrorMessage,
} from "./secureEnvDiscovery";
import { getSettings } from "./secureEnvSettings";
import {
  EmbeddedGenerationResult,
  SecureEnvCandidate,
} from "./secureEnvTypes";

const LAST_CONFIG_KEY = "secureEnvGenerator.lastConfigPath";
const outputChannel = vscode.window.createOutputChannel("Secure Env Generator");
let statusBarItem: vscode.StatusBarItem;
let generationInProgress = false;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    90,
  );
  statusBarItem.text = "$(shield) Secure Env";
  statusBarItem.command = "secureEnvGenerator.generateNearest";
  statusBarItem.show();

  context.subscriptions.push(
    outputChannel,
    statusBarItem,
    vscode.commands.registerCommand("secureEnvGenerator.generateNearest", async (resource: unknown) => {
      await runGenerateCommand(context, {
        preferNearest: true,
        targetUri: getCommandTargetUri(resource),
      });
    }),
    vscode.commands.registerCommand("secureEnvGenerator.generate", async (resource: unknown) => {
      await runGenerateCommand(context, {
        preferNearest: false,
        targetUri: getCommandTargetUri(resource),
      });
    }),
    vscode.commands.registerCommand("secureEnvGenerator.openConfig", async (resource: unknown) => {
      const candidate = await pickCandidate(context, {
        preferNearest: true,
        targetUri: getCommandTargetUri(resource),
      });
      if (!candidate) {
        return;
      }

      await openUri(candidate.configUri);
    }),
    vscode.commands.registerCommand("secureEnvGenerator.showOutput", () => {
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
    ].join("\n");
    statusBarItem.command = "secureEnvGenerator.generateNearest";
    statusBarItem.show();
    return;
  }

  statusBarItem.text = "$(shield) Secure Env";
  statusBarItem.tooltip = "Pick a secure env config and run generation";
  statusBarItem.command = "secureEnvGenerator.generate";
  statusBarItem.show();
}

async function pickCandidate(
  context: vscode.ExtensionContext,
  options: { preferNearest: boolean; targetUri?: vscode.Uri },
): Promise<SecureEnvCandidate | undefined> {
  const candidates = await discoverCandidates(outputChannel);
  if (candidates.length === 0) {
    void vscode.window.showErrorMessage(
      "No secure env config files were found. Expected files like tool/secure_env.json or tool/*secure_env*.json.",
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

  if (options.preferNearest) {
    const lastCandidate = findLastCandidate(
      candidates,
      context.workspaceState.get<string>(LAST_CONFIG_KEY),
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
      placeHolder: "Select the secure env config to generate",
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
  const candidates = await discoverCandidates(outputChannel, showErrors);
  if (targetUri) {
    const nearest = findNearestCandidate(candidates, targetUri);
    if (nearest) {
      return nearest;
    }
  }

  const lastCandidate = findLastCandidate(
    candidates,
    context.workspaceState.get<string>(LAST_CONFIG_KEY),
  );
  if (lastCandidate) {
    return lastCandidate;
  }

  return candidates.length === 1 ? candidates[0] : undefined;
}

async function runGenerator(
  context: vscode.ExtensionContext,
  candidate: SecureEnvCandidate,
): Promise<void> {
  if (generationInProgress) {
    outputChannel.appendLine(
      "[warn] Secure env generation is already running. Wait for the current run to finish.",
    );
    outputChannel.show(true);
    void vscode.window.showWarningMessage(
      "Secure env generation is already running. Wait for it to finish and check the output channel for progress.",
    );
    return;
  }

  const settings = getSettings();
  generationInProgress = true;

  outputChannel.appendLine("");
  outputChannel.appendLine(`=== ${new Date().toISOString()} ===`);
  outputChannel.appendLine(`Running secure env generation for: ${candidate.label}`);

  if (settings.autoOpenOutput) {
    outputChannel.show(true);
  }

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Generating ${candidate.label}`,
      },
      async () => runEmbeddedGenerator(candidate, outputChannel),
    );

    await context.workspaceState.update(LAST_CONFIG_KEY, candidate.configUri.fsPath);
    await showCompletionMessage(candidate, result);
  } catch (error) {
    appendError(`Secure env generation failed: ${toErrorMessage(error)}`);
    const action = await vscode.window.showErrorMessage(
      toErrorMessage(error),
      "Show Output",
    );
    if (action === "Show Output") {
      outputChannel.show(true);
    }
    throw error;
  } finally {
    generationInProgress = false;
  }
}

async function showCompletionMessage(
  candidate: SecureEnvCandidate,
  result: EmbeddedGenerationResult,
): Promise<void> {
  const message = result.mode === "bootstrapped"
    ? `Secure env bootstrapped: ${candidate.label}`
    : `Secure env generated: ${candidate.label}`;
  const action = await vscode.window.showInformationMessage(
    message,
    "Show Output",
    "Open Config",
  );

  if (action === "Show Output") {
    outputChannel.show(true);
  } else if (action === "Open Config") {
    await openUri(candidate.configUri);
  }
}

async function openUri(uri: vscode.Uri): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, { preview: false });
}

function appendError(message: string): void {
  outputChannel.appendLine(`[error] ${message}`);
}

function findLastCandidate(
  candidates: SecureEnvCandidate[],
  lastConfigPath: string | undefined,
): SecureEnvCandidate | undefined {
  if (!lastConfigPath) {
    return undefined;
  }

  return candidates.find(
    (candidate) =>
      normalizeFsPath(candidate.configUri.fsPath) === normalizeFsPath(lastConfigPath),
  );
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

function isUri(value: unknown): value is vscode.Uri {
  return Boolean(
    value &&
      typeof value === "object" &&
      "scheme" in value &&
      "fsPath" in value &&
      "path" in value,
  );
}
