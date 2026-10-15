import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { runGit } from '../../../../core/diff/git.mjs';

const MODULE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const COMPILED_TO_SOURCE = new Map([
  ['.js', ['.ts', '.tsx']],
  ['.jsx', ['.tsx']],
  ['.mjs', ['.mts']],
  ['.cjs', ['.cts']],
]);

function isFile(filePath) {
  return existsSync(filePath) && statSync(filePath).isFile();
}

function nameStatusEntries(output) {
  const tokens = output.split('\0').filter((token) => token.length > 0);
  const entries = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index];
    const paired = status.startsWith('R') || status.startsWith('C');
    entries.push({
      status: status[0],
      from: tokens[index + 1],
      to: paired ? tokens[index + 2] : tokens[index + 1],
    });
    index += paired ? 3 : 2;
  }
  return entries;
}

function changedTestPaths({ baselineRoot, projectRoot }, layout) {
  const baseCommit = runGit(baselineRoot, ['rev-parse', 'HEAD']).trim();
  const output = runGit(projectRoot, [
    '-c',
    'core.quotePath=false',
    'diff',
    '--name-status',
    '-z',
    '--find-renames',
    '--relative',
    '--no-color',
    '--no-ext-diff',
    baseCommit,
    'HEAD',
  ]);
  const entries = nameStatusEntries(output);
  return {
    head: entries
      .filter(({ status, to }) => status !== 'D' && layout.isTestFile(to))
      .map(({ to }) => to),
    base: entries
      .filter(({ status, from }) => !['A', 'C'].includes(status) && layout.isTestFile(from))
      .map(({ from }) => from),
  };
}

function resolveModule(root, request) {
  const normalized = path.posix.normalize(request);
  if (normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return undefined;
  const extension = path.posix.extname(normalized);
  const stem = normalized.slice(0, normalized.length - extension.length);
  const candidates = [
    normalized,
    ...(COMPILED_TO_SOURCE.get(extension) ?? []).map((sourceExtension) => stem + sourceExtension),
    ...MODULE_EXTENSIONS.map((moduleExtension) => normalized + moduleExtension),
    ...MODULE_EXTENSIONS.map((moduleExtension) => `${normalized}/index${moduleExtension}`),
  ];
  return candidates.find((candidate) => isFile(path.join(root, candidate)));
}

function importedSourceModules(root, testPath, layout) {
  const text = readFileSync(path.join(root, testPath), 'utf8');
  const directory = path.posix.dirname(testPath);
  return ts
    .preProcessFile(text, true, true)
    .importedFiles.map(({ fileName }) => fileName)
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => resolveModule(root, path.posix.join(directory, specifier)))
    .filter((modulePath) => modulePath !== undefined && layout.isSourceFile(modulePath));
}

export function testedSourceModules(options, layout) {
  const { snapshot, baselineRoot, projectRoot } = options;
  if (snapshot === 'base' || baselineRoot === undefined) return [];
  const changed = changedTestPaths(options, layout);
  const modules = new Set([
    ...changed.head.flatMap((testPath) => importedSourceModules(projectRoot, testPath, layout)),
    ...changed.base.flatMap((testPath) => importedSourceModules(baselineRoot, testPath, layout)),
  ]);
  return [...modules]
    .filter((modulePath) => isFile(path.join(baselineRoot, modulePath)))
    .filter((modulePath) => isFile(path.join(projectRoot, modulePath)))
    .sort();
}
