import { readFileSync, existsSync, symlinkSync, unlinkSync } from 'node:fs';
import { glob, readFile } from 'node:fs/promises';
import { prettierPrecedence, usesLayeredPrettier, readLayout } from '../../preset/head-policy.mjs';
import type * as Prettier from 'prettier';
import type { StaticCheckOptions } from './arguments.mts';
import {
  type Finding,
  runNodeTool,
  projectFile,
  policyFile,
  hash,
  resolveTool,
  toolBinaryPath,
} from './shared.mts';
import { isIgnoredByLayers, layeredPrettierOptions } from '../prettier/prettier-layers.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { trackTemporaryPath } from '../../../../core/tooling/temporary-files.mjs';
import { formattingHunks } from '../prettier/format-hunks.mts';
import { listUnformattedInParallel } from '../prettier/parallel-cli.mts';
import { formatAdvice } from '../../../../shared/messages/format/format-advice.mjs';

const PRETTIER_MESSAGE = `These lines are not formatted with Prettier. ${formatAdvice()}`;

type InstalledPolicy = {
  readonly configPath: string;
  readonly ignorePath: string;
  remove(): void;
};

type PolicyLinks = {
  readonly policyConfig: string;
  readonly policyIgnore: string;
  readonly configPath: string;
  readonly ignorePath: string;
};

type FormattedSource = {
  readonly tool: string;
  readonly relativePath: string;
  readonly source: string;
};

export async function runPrettier(options: StaticCheckOptions): Promise<Finding[]> {
  if (options.patterns.length === 0) {
    throw new Error('Prettier requires at least one --pattern');
  }
  if (options.ignoreRelativePath === undefined) {
    throw new Error('Prettier requires --ignore-path');
  }
  if ((await matchingFiles(options)).length === 0) {
    return [];
  }
  const installedPolicy = installPrettierPolicy(options, options.ignoreRelativePath);
  try {
    if (usesLayeredPrettier()) {
      return await layeredFormattingFindings(options, installedPolicy, prettierPrecedence());
    }
    const unformattedFiles = listUnformattedFiles(options, installedPolicy);
    return await formattingFindingsOf(options, unformattedFiles, installedPolicy.configPath);
  } finally {
    installedPolicy.remove();
  }
}

function listUnformattedFiles(
  options: StaticCheckOptions,
  installedPolicy: InstalledPolicy,
): string[] {
  const exclusions: string[] = readLayout().exclude;
  return (
    listUnformattedInParallel({
      toolPath: toolBinaryPath('prettier', {
        projectRoot: options.liveProjectRoot,
        bin: 'bin/prettier.cjs',
      }),
      projectRoot: options.projectRoot,
      configPath: installedPolicy.configPath,
      ignorePath: installedPolicy.ignorePath,
      patterns: options.patterns,
      exclusions,
    }) ?? listUnformattedFilesSerially(options, installedPolicy, exclusions)
  );
}

function listUnformattedFilesSerially(
  options: StaticCheckOptions,
  installedPolicy: InstalledPolicy,
  exclusions: readonly string[],
): string[] {
  const result = runNodeTool({
    options,
    relativeToolPath: 'prettier/bin/prettier.cjs',
    arguments_: [
      '--config',
      installedPolicy.configPath,
      '--ignore-path',
      installedPolicy.ignorePath,
      '--no-editorconfig',
      '--list-different',
      '--no-error-on-unmatched-pattern',
      ...options.patterns,
      ...exclusions.map((glob) => `!${glob}`),
    ],
    acceptedStatuses: [0, 1],
  });
  const unformattedFiles = result.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (result.status === 1 && unformattedFiles.length === 0) {
    throw new Error(`Prettier reported formatting differences without file paths`);
  }
  return unformattedFiles;
}

async function matchingFiles(options: StaticCheckOptions): Promise<string[]> {
  const perPattern = await Promise.all(
    options.patterns.map((pattern) => Array.fromAsync(glob(pattern, { cwd: options.projectRoot }))),
  );
  return [...new Set(perPattern.flat())];
}

async function layeredFormattingFindings(
  options: StaticCheckOptions,
  installedPolicy: InstalledPolicy,
  precedence: unknown,
): Promise<Finding[]> {
  const prettier = await importPrettier();
  const policyOptions = readPrettierPolicy(installedPolicy.configPath);
  const layout = readLayout();
  const candidates = (await matchingFiles(options)).filter(
    (relativePath) => !layout.isExcluded(relativePath),
  );
  const layers = {
    precedence,
    policyIgnorePath: installedPolicy.ignorePath,
    projectRoot: options.projectRoot,
    liveProjectRoot: options.liveProjectRoot,
  };
  const perFile = await Promise.all(
    candidates.map(async (relativePath) => {
      if (await isIgnoredByLayers(prettier, { ...layers, relativePath })) {
        return [];
      }
      const source = await readFile(path.join(options.projectRoot, relativePath), 'utf8');
      const formatted = await prettier.format(source, {
        ...(await layeredPrettierOptions(prettier, { ...layers, policyOptions, relativePath })),
        filepath: path.join(options.projectRoot, relativePath),
      });
      return formatted === source
        ? []
        : formattingFindings({ tool: options.analyzerName, relativePath, source }, formatted);
    }),
  );
  return perFile.flat();
}

async function importPrettier(): Promise<typeof Prettier> {
  return import(pathToFileURL(path.join(resolveTool('prettier').root, 'index.mjs')).href);
}

function readPrettierPolicy(configPath: string): Prettier.Options {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error('Prettier policy is not valid JSON', { cause: error });
  }
}

async function formattingFindingsOf(
  options: StaticCheckOptions,
  unformattedFiles: readonly string[],
  configPath: string,
): Promise<Finding[]> {
  const prettier = await importPrettier();
  const prettierOptions = readPrettierPolicy(configPath);
  const perFile = await Promise.all(
    unformattedFiles.map(async (filePath) => {
      const relativePath = projectFile(options.projectRoot, filePath);
      const absolutePath = path.join(options.projectRoot, relativePath);
      const source = await readFile(absolutePath, 'utf8');
      const formatted = await prettier.format(source, {
        ...prettierOptions,
        filepath: absolutePath,
      });
      return formattingFindings({ tool: options.analyzerName, relativePath, source }, formatted);
    }),
  );
  return perFile.flat();
}

function installPrettierPolicy(
  options: StaticCheckOptions,
  ignoreRelativePath: string,
): InstalledPolicy {
  const policyConfig = policyFile(options, options.configRelativePath);
  const policyIgnore = policyFile(options, ignoreRelativePath);
  if (options.projectRoot === options.policyRoot) {
    return { configPath: policyConfig, ignorePath: policyIgnore, remove() {} };
  }
  const configPath = path.join(options.projectRoot, '.nitpicker-diff-prettier.json');
  const ignorePath = path.join(options.projectRoot, '.nitpicker-diff-prettierignore');
  if (existsSync(configPath) || existsSync(ignorePath)) {
    throw new Error('Temporary Prettier policy path already exists');
  }
  trackTemporaryPath(configPath);
  trackTemporaryPath(ignorePath);
  linkPrettierPolicy({ policyConfig, policyIgnore, configPath, ignorePath });
  return {
    configPath,
    ignorePath,
    remove() {
      unlinkSync(ignorePath);
      unlinkSync(configPath);
    },
  };
}

function linkPrettierPolicy({
  policyConfig,
  policyIgnore,
  configPath,
  ignorePath,
}: PolicyLinks): void {
  symlinkSync(policyConfig, configPath, 'file');
  try {
    symlinkSync(policyIgnore, ignorePath, 'file');
  } catch (error) {
    unlinkSync(configPath);
    throw error;
  }
}

function formattingFindings(
  { tool, relativePath, source }: FormattedSource,
  formatted: string,
): Finding[] {
  const seen = new Map<string, number>();
  return formattingHunks(source, formatted).map((hunk) => {
    const digest = hash(`${hunk.original}\0${hunk.formatted}`);
    const occurrence = seen.get(digest) ?? 0;
    seen.set(digest, occurrence + 1);
    return {
      tool,
      rule: 'prettier/prettier',
      path: relativePath,
      identity: `format-diff:${digest}${occurrence === 0 ? '' : `#${String(occurrence)}`}`,
      message: PRETTIER_MESSAGE,
      classification: 'enforceable',
      location: { line: hunk.line, endLine: hunk.line + Math.max(hunk.count, 1) - 1 },
    };
  });
}
