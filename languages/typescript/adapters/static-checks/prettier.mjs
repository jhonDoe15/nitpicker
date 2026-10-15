import { globSync, readFileSync, existsSync, symlinkSync, unlinkSync } from 'node:fs';

import { prettierPrecedence, usesProjectConfig, readLayout } from '../../preset/head-policy.mjs';

import { runNodeTool, projectFile, policyFile, hash } from './shared.mjs';

import { isIgnoredByLayers, layeredPrettierOptions } from '../prettier/prettier-layers.mjs';

import path from 'node:path';

import { pathToFileURL } from 'node:url';

import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';

import { trackTemporaryPath } from '../../../../core/tooling/temporary-files.mjs';

import { formattingHunks } from '../prettier/format-hunks.mjs';

export async function runPrettier(options) {
  if (options.patterns.length === 0) {
    throw new Error('Prettier requires at least one --pattern');
  }
  if (options.ignoreRelativePath === undefined) {
    throw new Error('Prettier requires --ignore-path');
  }
  if (
    !options.patterns.some((pattern) => globSync(pattern, { cwd: options.projectRoot }).length > 0)
  )
    return [];
  const installedPolicy = installPrettierPolicy(options);
  try {
    const precedence = prettierPrecedence();
    if (usesProjectConfig(precedence)) {
      return await layeredFormattingFindings(options, installedPolicy, precedence);
    }
    const unformattedFiles = listUnformattedFiles(options, installedPolicy);
    return await formattingFindingsOf(options, unformattedFiles, installedPolicy.configPath);
  } finally {
    installedPolicy.remove();
  }
}

function listUnformattedFiles(options, installedPolicy) {
  const result = runNodeTool({
    options,
    relativeToolPath: 'prettier/bin/prettier.cjs',
    arguments_: [
      '--config',
      installedPolicy.configPath,
      '--ignore-path',
      installedPolicy.ignorePath,
      '--list-different',
      '--no-error-on-unmatched-pattern',
      ...options.patterns,
      ...readLayout().exclude.map((glob) => `!${glob}`),
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

async function layeredFormattingFindings(options, installedPolicy, precedence) {
  const prettier = await importPrettier();
  const policyOptions = readPrettierPolicy(installedPolicy.configPath);
  const layout = readLayout();
  const candidates = [
    ...new Set(
      options.patterns.flatMap((pattern) => globSync(pattern, { cwd: options.projectRoot })),
    ),
  ].filter((relativePath) => !layout.isExcluded(relativePath));
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
      const source = readFileSync(path.join(options.projectRoot, relativePath), 'utf8');
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

async function importPrettier() {
  return import(pathToFileURL(path.join(resolveTool('prettier').root, 'index.mjs')).href);
}

function readPrettierPolicy(configPath) {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error('Prettier policy is not valid JSON', { cause: error });
  }
}

async function formattingFindingsOf(options, unformattedFiles, configPath) {
  const prettier = await importPrettier();
  const prettierOptions = readPrettierPolicy(configPath);
  const perFile = await Promise.all(
    unformattedFiles.map(async (filePath) => {
      const relativePath = projectFile(options.projectRoot, filePath);
      const absolutePath = path.join(options.projectRoot, relativePath);
      const source = readFileSync(absolutePath, 'utf8');
      const formatted = await prettier.format(source, {
        ...prettierOptions,
        filepath: absolutePath,
      });
      return formattingFindings({ tool: options.analyzerName, relativePath, source }, formatted);
    }),
  );
  return perFile.flat();
}

function installPrettierPolicy(options) {
  const policyConfig = policyFile(options, options.configRelativePath);
  const policyIgnore = policyFile(options, options.ignoreRelativePath);
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
  symlinkSync(policyConfig, configPath, 'file');
  try {
    symlinkSync(policyIgnore, ignorePath, 'file');
  } catch (error) {
    unlinkSync(configPath);
    throw error;
  }
  return {
    configPath,
    ignorePath,
    remove() {
      unlinkSync(ignorePath);
      unlinkSync(configPath);
    },
  };
}

function formattingFindings({ tool, relativePath, source }, formatted) {
  const seen = new Map();
  return formattingHunks(source, formatted).map((hunk) => {
    const digest = hash(`${hunk.original}\0${hunk.formatted}`);
    const occurrence = seen.get(digest) ?? 0;
    seen.set(digest, occurrence + 1);
    return {
      tool,
      rule: 'prettier/prettier',
      path: relativePath,
      identity: `format-diff:${digest}${occurrence === 0 ? '' : `#${String(occurrence)}`}`,
      message: 'Format these lines with Prettier',
      classification: 'enforceable',
      location: { line: hunk.line, endLine: hunk.line + Math.max(hunk.count, 1) - 1 },
    };
  });
}
