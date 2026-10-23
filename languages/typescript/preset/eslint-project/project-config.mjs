import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const ESLINT_PROJECT_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
];
const MODULE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.json'];
const SCRIPT_SPECIFIER = /\.([cm]?)js$/u;

function insideFile(root, relative) {
  const base = path.resolve(root);
  const full = path.resolve(base, relative);
  if (!full.startsWith(base + path.sep) || !existsSync(full) || !statSync(full).isFile()) {
    return undefined;
  }
  const realBase = realpathSync(base);
  if (!realpathSync(full).startsWith(realBase + path.sep)) {
    return undefined;
  }
  return full;
}

function projectFileText(root, relative) {
  const full = insideFile(root, relative);
  if (full === undefined) {
    throw new Error(`${relative} is not a file inside the project`);
  }
  return readFileSync(full, 'utf8');
}

export function projectEslintConfig(root) {
  return ESLINT_PROJECT_FILES.find((name) => insideFile(root, name) !== undefined);
}

function moduleCandidates(relative) {
  return [
    relative,
    relative.replace(SCRIPT_SPECIFIER, '.$1ts'),
    ...MODULE_EXTENSIONS.map((extension) => `${relative}${extension}`),
    ...MODULE_EXTENSIONS.map((extension) => `${relative}/index${extension}`),
  ];
}

function localImports(root, file) {
  if (path.posix.extname(file) === '.json') {
    return [];
  }
  return ts
    .preProcessFile(projectFileText(root, file), true, true)
    .importedFiles.map(({ fileName }) => fileName)
    .filter((specifier) => specifier.startsWith('./') || specifier.startsWith('../'))
    .map((specifier) => path.posix.join(path.posix.dirname(file), specifier))
    .flatMap(
      (relative) =>
        moduleCandidates(relative).find((name) => insideFile(root, name) !== undefined) ?? [],
    );
}

export function eslintConfigFiles(root) {
  const config = projectEslintConfig(root);
  if (config === undefined) {
    return [];
  }
  const seen = new Set([config]);
  const queue = [config];
  for (const file of queue) {
    const unseen = new Set(localImports(root, file).filter((imported) => !seen.has(imported)));
    for (const imported of unseen) {
      seen.add(imported);
      queue.push(imported);
    }
  }
  return [config, ...[...seen].slice(1).toSorted()];
}

export function eslintProjectFacts(root) {
  const files = eslintConfigFiles(root);
  if (files.length === 0) {
    return { projectConfigMissing: true };
  }
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(`${file}\0${projectFileText(root, file)}\0`);
  }
  return { projectConfigFile: files[0], projectConfigDigest: hash.digest('hex') };
}
