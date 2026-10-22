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

function isFileInside(root, relative) {
  const full = path.resolve(root, relative);
  if (!existsSync(full) || !statSync(full).isFile()) {
    return false;
  }
  const inside = path.relative(realpathSync(root), realpathSync(full));
  return inside !== '' && !inside.startsWith('..') && !path.isAbsolute(inside);
}

export function projectEslintConfig(root) {
  return ESLINT_PROJECT_FILES.find((name) => isFileInside(root, name));
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
  const text = readFileSync(path.join(root, file), 'utf8');
  return ts
    .preProcessFile(text, true, true)
    .importedFiles.map(({ fileName }) => fileName)
    .filter((specifier) => specifier.startsWith('./') || specifier.startsWith('../'))
    .map((specifier) => path.posix.join(path.posix.dirname(file), specifier))
    .flatMap(
      (relative) => moduleCandidates(relative).find((name) => isFileInside(root, name)) ?? [],
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
    for (const imported of localImports(root, file)) {
      if (!seen.has(imported)) {
        seen.add(imported);
        queue.push(imported);
      }
    }
  }
  return [config, ...[...seen].slice(1).toSorted()];
}

export function eslintProjectFacts(root) {
  const files = eslintConfigFiles(root);
  if (files.length === 0) {
    return { projectConfigFile: null };
  }
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(`${file}\0${readFileSync(path.join(root, file), 'utf8')}\0`);
  }
  return { projectConfigFile: files[0], projectConfigDigest: hash.digest('hex') };
}
