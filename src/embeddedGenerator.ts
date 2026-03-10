import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import { spawn, spawnSync } from "child_process";

import type * as vscode from "vscode";

import {
  EmbeddedGenerationResult,
  SecureEnvCandidate,
  UseFvm,
} from "./secureEnvTypes";

const PLACEHOLDER_SECRET_VALUES = new Set([
  "YOUR_BASE64_ENCRYPTION_KEY",
  "YOUR_BASE64_IV",
  "YOUR_ENCRYPTION_KEY",
  "YOUR_IV",
  "<AUTO_GENERATE>",
  "AUTO_GENERATE",
]);

interface ToolCommandSpec {
  command: string;
  prefix: string[];
}

interface BuildRunnerOptions {
  projectRoot: string;
  commandSpec: ToolCommandSpec;
  displayName: string;
  outputKeyFile: string;
  outputChannel: vscode.OutputChannel;
  encryptionKey?: string;
  initializationVector?: string;
}

export async function runEmbeddedGenerator(
  candidate: SecureEnvCandidate,
  outputChannel: vscode.OutputChannel,
  options?: { rotateKeys?: boolean },
): Promise<EmbeddedGenerationResult> {
  const projectRoot = candidate.projectRootUri.fsPath;
  const envFilePath = candidate.envFileUri.fsPath;
  const envDartFilePath = candidate.envDartFileUri.fsPath;
  const outputKeyFilePath = resolveProjectFilePath(
    projectRoot,
    candidate.outputKeyFile,
  );
  const toolCommandSpec = getToolCommandSpec(candidate.useFvm);

  if (!await fileExists(envDartFilePath)) {
    throw new Error(`Env dart file not found: ${envDartFilePath}`);
  }

  await ensureEnvFileExists(candidate, outputChannel, envFilePath);

  const envDartContent = await fsPromises.readFile(envDartFilePath, "utf8");
  const encryptionKeyMatch = getSecretMatch(
    envDartContent,
    "_encryptionKey",
    envDartFilePath,
  );
  const initializationVectorMatch = getSecretMatch(
    envDartContent,
    "_iv",
    envDartFilePath,
  );
  const existingEncryptionKey = encryptionKeyMatch[3].trim();
  const existingInitializationVector = initializationVectorMatch[3].trim();
  const needsBootstrap = Boolean(options?.rotateKeys) ||
    isMissingSecretValue(existingEncryptionKey) ||
    isMissingSecretValue(existingInitializationVector);

  if (needsBootstrap) {
    outputChannel.appendLine(
      `Bootstrapping new ENCRYPTION_KEY / IV for ${candidate.label}...`,
    );

    await invokeBuildRunner({
      projectRoot,
      commandSpec: toolCommandSpec,
      displayName: candidate.label,
      outputKeyFile: candidate.outputKeyFile,
      outputChannel,
    });

    if (!await fileExists(outputKeyFilePath)) {
      throw new Error(
        `Expected temporary key file was not generated: ${outputKeyFilePath}`,
      );
    }

    const generatedSecrets = JSON.parse(
      await fsPromises.readFile(outputKeyFilePath, "utf8"),
    ) as Record<string, unknown>;
    const generatedEncryptionKey = String(generatedSecrets.ENCRYPTION_KEY ?? "").trim();
    const generatedInitializationVector = String(generatedSecrets.IV ?? "").trim();

    if (!generatedEncryptionKey || !generatedInitializationVector) {
      throw new Error(
        `Temporary key file is missing ENCRYPTION_KEY or IV: ${outputKeyFilePath}`,
      );
    }

    let updatedContent = setSecretValue(
      envDartContent,
      "_encryptionKey",
      generatedEncryptionKey,
    );
    updatedContent = setSecretValue(
      updatedContent,
      "_iv",
      generatedInitializationVector,
    );

    await fsPromises.writeFile(envDartFilePath, updatedContent, "utf8");
    outputChannel.appendLine(`Updated _encryptionKey / _iv in ${candidate.config.envDartFile}.`);

    await fsPromises.rm(outputKeyFilePath, { force: true });
    outputChannel.appendLine(`Removed temporary ${candidate.outputKeyFile}.`);
    outputChannel.appendLine(`${candidate.label} bootstrapped successfully.`);
    return { mode: "bootstrapped" };
  }

  await invokeBuildRunner({
    projectRoot,
    commandSpec: toolCommandSpec,
    displayName: candidate.label,
    outputKeyFile: candidate.outputKeyFile,
    outputChannel,
    encryptionKey: existingEncryptionKey,
    initializationVector: existingInitializationVector,
  });

  if (await fileExists(outputKeyFilePath)) {
    await fsPromises.rm(outputKeyFilePath, { force: true });
    outputChannel.appendLine(`Removed temporary ${candidate.outputKeyFile}.`);
  }

  outputChannel.appendLine(`${candidate.label} regenerated successfully.`);
  return { mode: "generated" };
}

async function ensureEnvFileExists(
  candidate: SecureEnvCandidate,
  outputChannel: vscode.OutputChannel,
  envFilePath: string,
): Promise<void> {
  if (await fileExists(envFilePath)) {
    return;
  }

  if (
    !candidate.envExampleFileUri ||
    !await fileExists(candidate.envExampleFileUri.fsPath)
  ) {
    throw new Error(
      `Missing ${envFilePath} and no usable envExampleFile was provided.`,
    );
  }

  await fsPromises.copyFile(
    candidate.envExampleFileUri.fsPath,
    envFilePath,
  );
  outputChannel.appendLine(`Created ${candidate.config.envFile} from example.`);
}

function getToolCommandSpec(useFvm: UseFvm): ToolCommandSpec {
  switch (useFvm) {
    case "Always":
      if (!commandExists("fvm")) {
        throw new Error("fvm was requested but is not available in PATH.");
      }
      return { command: "fvm", prefix: ["flutter"] };
    case "Never":
      if (!commandExists("flutter")) {
        throw new Error("flutter is not available in PATH.");
      }
      return { command: "flutter", prefix: [] };
    default:
      if (commandExists("fvm")) {
        return { command: "fvm", prefix: ["flutter"] };
      }
      if (commandExists("flutter")) {
        return { command: "flutter", prefix: [] };
      }
      throw new Error("Neither fvm nor flutter is available in PATH.");
  }
}

async function invokeBuildRunner(options: BuildRunnerOptions): Promise<void> {
  const argumentsList = [
    ...options.commandSpec.prefix,
    "pub",
    "run",
    "build_runner",
    "build",
    "--delete-conflicting-outputs",
  ];

  if (
    options.encryptionKey !== undefined ||
    options.initializationVector !== undefined
  ) {
    if (!options.encryptionKey || !options.initializationVector) {
      throw new Error("ENCRYPTION_KEY and IV must both be set or both be omitted.");
    }

    argumentsList.push(
      "--define",
      `flutter_secure_dotenv_generator:flutter_secure_dotenv=ENCRYPTION_KEY=${options.encryptionKey}`,
      "--define",
      `flutter_secure_dotenv_generator:flutter_secure_dotenv=IV=${options.initializationVector}`,
    );
  }

  argumentsList.push(
    "--define",
    `flutter_secure_dotenv_generator:flutter_secure_dotenv=OUTPUT_FILE=${options.outputKeyFile}`,
  );

  options.outputChannel.appendLine(`Regenerating ${options.displayName}...`);
  options.outputChannel.appendLine(`Working directory: ${options.projectRoot}`);
  options.outputChannel.appendLine(
    `Using command: ${formatCommandLine(options.commandSpec.command, argumentsList)}`,
  );

  await runProcess(
    options.commandSpec.command,
    argumentsList,
    options.projectRoot,
    options.outputChannel,
  );
}

async function runProcess(
  executable: string,
  args: string[],
  cwd: string,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      windowsHide: true,
    });

    child.stdout.on("data", (chunk: Buffer | string) => {
      outputChannel.append(chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      outputChannel.append(chunk.toString());
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Secure env generation failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

function commandExists(command: string): boolean {
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(lookup, [command], {
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0;
}

function formatCommandLine(command: string, argumentsList: string[]): string {
  return [command, ...argumentsList]
    .map((segment) =>
      /\s/.test(segment)
        ? `"${segment.replace(/"/g, "\\\"")}"`
        : segment
    )
    .join(" ");
}

function getSecretMatch(
  content: string,
  secretName: string,
  filePath: string,
): RegExpExecArray {
  const regex = new RegExp(
    `^(\\s*static const(?: String)? ${escapeRegExp(secretName)} = )(['"])([^'"]*)(['"];)\\s*$`,
    "m",
  );
  const match = regex.exec(content);
  if (!match) {
    throw new Error(
      [
        `Missing ${secretName} in ${filePath}.`,
        "Add these constants to the annotated env class before using the embedded generator:",
        "  static const _encryptionKey = 'YOUR_BASE64_ENCRYPTION_KEY';",
        "  static const _iv = 'YOUR_BASE64_IV';",
      ].join("\n"),
    );
  }

  return match;
}

function setSecretValue(
  content: string,
  secretName: string,
  newValue: string,
): string {
  const regex = new RegExp(
    `^(\\s*static const(?: String)? ${escapeRegExp(secretName)} = )(['"])([^'"]*)(['"];)\\s*$`,
    "m",
  );
  return content.replace(
    regex,
    (_match, prefix: string, quote: string, _current: string, suffix: string) =>
      `${prefix}${quote}${newValue}${suffix}`,
  );
}

function isMissingSecretValue(value: string): boolean {
  if (!value.trim()) {
    return true;
  }

  return PLACEHOLDER_SECRET_VALUES.has(value.trim());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveProjectFilePath(projectRootPath: string, targetPath: string): string {
  if (path.isAbsolute(targetPath)) {
    return path.normalize(targetPath);
  }

  return path.normalize(path.join(projectRootPath, targetPath));
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fsPromises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
