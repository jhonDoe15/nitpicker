import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SUPPRESS_WARNINGS = /@\s*(?:java\s*\.\s*lang\s*\.\s*)?SuppressWarnings\s*\([^)]*\)/gu;
const LOMBOK_CONFIG = 'lombok.config';
const STOP_BUBBLING = 'config.stopBubbling = true\n';
const STOPS_BUBBLING = /^\s*config\.stopBubbling\s*=\s*true\s*$/mu;
const IMPORT = /^(\s*import\s+)(\S(?:.*\S)?)\s*$/gmu;
const STAGED_TREE = 'tree';
const ANCHORED_IMPORT = /^(?:[/~<\\]|[A-Za-z]:[/\\])/u;

export function posix(file) {
  return file.split(path.sep).join('/');
}

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

function anchoredImport(directory, target) {
  if (ANCHORED_IMPORT.test(target)) {
    return target;
  }
  const [file, ...entry] = target.split('!');
  return [posix(path.resolve(directory, file)), ...entry].join('!');
}

function withAnchoredImports(text, directory) {
  return text.replaceAll(
    IMPORT,
    (_, keyword, target) => `${keyword}${anchoredImport(directory, target)}`,
  );
}

function copyLombokConfig(target, config) {
  const directory = path.dirname(config);
  mkdirSync(target, { recursive: true });
  writeFileSync(
    path.join(target, LOMBOK_CONFIG),
    withAnchoredImports(readFileSync(config, 'latin1'), directory),
    'latin1',
  );
}

export function stageSources({ root, sources, staged }) {
  const inherited = inheritedLombokConfigs(root);
  const top = inherited.length === 0 ? root : path.dirname(inherited.at(-1));
  const tree = path.join(staged, STAGED_TREE);
  function at(directory) {
    return path.join(tree, path.relative(top, directory));
  }
  const files = sources.map((source) => {
    const target = path.join(at(root), path.relative(root, source));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, blankSuppressions(readFileSync(source, 'latin1')), 'latin1');
    return target;
  });
  for (const config of [...inherited, ...lombokConfigs({ root, sources })]) {
    copyLombokConfig(at(path.dirname(config)), config);
  }
  writeFileSync(path.join(staged, LOMBOK_CONFIG), STOP_BUBBLING, 'latin1');
  return { files, root: at(root) };
}
