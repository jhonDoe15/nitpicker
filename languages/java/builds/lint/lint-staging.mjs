import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SUPPRESS_WARNINGS = /@\s*(?:java\s*\.\s*lang\s*\.\s*)?SuppressWarnings\s*\([^)]*\)/gu;
const LOMBOK_CONFIG = 'lombok.config';
const STOP_BUBBLING = 'config.stopBubbling = true\n';
const STOPS_BUBBLING = /^\s*config\.stopBubbling\s*=\s*true\s*$/mu;
const IMPORT = /^(\s*import\s+)(\S(?:.*\S)?)\s*$/gmu;
const ANCHORED_IMPORT = /^(?:[/~<\\]|[A-Za-z]:[/\\])/u;

export function blankSuppressions(text) {
  return text.replaceAll(SUPPRESS_WARNINGS, (match) => match.replaceAll(/[^\n]/gu, ' '));
}

function directoriesUpTo(root, directory) {
  const relative = path.relative(root, directory);
  const parts = relative === '' ? [] : relative.split(path.sep);
  return parts.map((_, index) => path.join(root, ...parts.slice(0, index + 1)));
}

function ancestorsOf(directory) {
  const { root } = path.parse(directory);
  const parts = path.relative(root, directory).split(path.sep).filter(Boolean);
  return parts.map((_, index) => path.join(root, ...parts.slice(0, parts.length - 1 - index)));
}

export function inheritedLombokConfigs(root) {
  const resolved = path.resolve(root);
  const configs = [resolved, ...ancestorsOf(resolved)]
    .map((directory) => path.join(directory, LOMBOK_CONFIG))
    .filter((config) => existsSync(config));
  const stop = configs.findIndex((config) => STOPS_BUBBLING.test(readFileSync(config, 'latin1')));
  return (stop < 0 ? configs : configs.slice(0, stop + 1)).filter(
    (config) => path.dirname(config) !== resolved,
  );
}

export function lombokConfigs({ root, sources }) {
  const directories = new Set([
    root,
    ...sources.flatMap((source) => directoriesUpTo(root, path.dirname(source))),
  ]);
  return [...directories]
    .map((directory) => path.join(directory, LOMBOK_CONFIG))
    .filter((config) => existsSync(config))
    .sort();
}

function mirrored(staged, directory) {
  const { root } = path.parse(directory);
  const drive = root.replaceAll(/[:/\\]/gu, '');
  return path.join(staged, drive, path.relative(root, directory));
}

export function stagedRoot(staged, root) {
  return mirrored(staged, path.resolve(root));
}

function anchoredImport(directory, target) {
  if (ANCHORED_IMPORT.test(target)) {
    return target;
  }
  const [file, ...entry] = target.split('!');
  return [path.resolve(directory, file).split(path.sep).join('/'), ...entry].join('!');
}

function withAnchoredImports(text, directory) {
  return text.replaceAll(
    IMPORT,
    (_, keyword, target) => `${keyword}${anchoredImport(directory, target)}`,
  );
}

function copyLombokConfig(staged, config) {
  const directory = path.dirname(config);
  const target = path.join(mirrored(staged, directory), LOMBOK_CONFIG);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, withAnchoredImports(readFileSync(config, 'latin1'), directory), 'latin1');
}

export function stageSources({ root, sources, staged }) {
  const base = stagedRoot(staged, root);
  const files = sources.map((source) => {
    const target = path.join(base, path.relative(root, source));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, blankSuppressions(readFileSync(source, 'latin1')), 'latin1');
    return target;
  });
  const configs = [...inheritedLombokConfigs(root), ...lombokConfigs({ root, sources })];
  for (const config of configs) {
    copyLombokConfig(staged, config);
  }
  writeFileSync(path.join(staged, LOMBOK_CONFIG), STOP_BUBBLING, 'latin1');
  return files;
}
