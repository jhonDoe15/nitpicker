import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SUPPRESS_WARNINGS = /@\s*(?:java\s*\.\s*lang\s*\.\s*)?SuppressWarnings\s*\([^)]*\)/gu;
const LATIN1 = 'latin1';
const LOMBOK_CONFIG = 'lombok.config';
const STOP_BUBBLING = 'config.stopBubbling = true\n';
const STOPS_BUBBLING = /^\s*config\.stopBubbling\s*=\s*true\s*$/mu;
const IMPORT = /^(\s*import\s+)(\S(?:.*\S)?)\s*$/gmu;
const STAGED_TREE = 'tree';
const ANCHORED_IMPORT = /^(?:[/~<\\]|[A-Za-z]:[/\\])/u;

export function posix(file: string): string {
  return file.split(path.sep).join('/');
}

export function blankSuppressions(text: string): string {
  return text.replaceAll(SUPPRESS_WARNINGS, (match) => match.replaceAll(/[^\n]/gu, ' '));
}

function directoriesUpTo(root: string, directory: string): string[] {
  const relative = path.relative(root, directory);
  const parts = relative === '' ? [] : relative.split(path.sep);
  return parts.map((_, index) => path.join(root, ...parts.slice(0, index + 1)));
}

function ancestorsOf(directory: string): string[] {
  const { root } = path.parse(directory);
  const parts = path.relative(root, directory).split(path.sep).filter(Boolean);
  return parts.map((_, index) => path.join(root, ...parts.slice(0, parts.length - 1 - index)));
}

export function inheritedLombokConfigs(root: string): string[] {
  const resolved = path.resolve(root);
  const configs = [resolved, ...ancestorsOf(resolved)]
    .map((directory) => path.join(directory, LOMBOK_CONFIG))
    .filter((config) => existsSync(config));
  const stop = configs.findIndex((config) => STOPS_BUBBLING.test(readFileSync(config, LATIN1)));
  return (stop < 0 ? configs : configs.slice(0, stop + 1)).filter(
    (config) => path.dirname(config) !== resolved,
  );
}

export function lombokConfigs({
  root,
  sources,
}: {
  readonly root: string;
  readonly sources: readonly string[];
}): string[] {
  const directories = new Set([
    root,
    ...sources.flatMap((source) => directoriesUpTo(root, path.dirname(source))),
  ]);
  return [...directories]
    .map((directory) => path.join(directory, LOMBOK_CONFIG))
    .filter((config) => existsSync(config))
    .sort();
}

function anchoredImport(directory: string, target: string): string {
  if (ANCHORED_IMPORT.test(target)) {
    return target;
  }
  const [file = '', ...entry] = target.split('!');
  return [posix(path.resolve(directory, file)), ...entry].join('!');
}

function withAnchoredImports(text: string, directory: string): string {
  return text.replaceAll(
    IMPORT,
    (_: string, keyword: string, target: string) =>
      `${keyword}${anchoredImport(directory, target)}`,
  );
}

function copyLombokConfig(target: string, config: string): void {
  const directory = path.dirname(config);
  mkdirSync(target, { recursive: true });
  writeFileSync(
    path.join(target, LOMBOK_CONFIG),
    withAnchoredImports(readFileSync(config, LATIN1), directory),
    LATIN1,
  );
}

export function stageSources({
  root,
  sources,
  staged,
}: {
  readonly root: string;
  readonly sources: readonly string[];
  readonly staged: string;
}): { files: string[]; root: string } {
  const inherited = inheritedLombokConfigs(root);
  const top = inherited.length === 0 ? root : path.dirname(inherited.at(-1) ?? root);
  const tree = path.join(staged, STAGED_TREE);
  function at(directory: string): string {
    return path.join(tree, path.relative(top, directory));
  }
  const stagedRoot = at(root);
  const files = sources.map((source) => {
    const target = path.resolve(stagedRoot, path.relative(root, source));
    if (!target.startsWith(stagedRoot + path.sep)) {
      throw new Error(`${source} is outside the lint root ${root}`);
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, blankSuppressions(readFileSync(source, LATIN1)), LATIN1);
    return target;
  });
  for (const config of [...inherited, ...lombokConfigs({ root, sources })]) {
    copyLombokConfig(at(path.dirname(config)), config);
  }
  writeFileSync(path.join(staged, LOMBOK_CONFIG), STOP_BUBBLING, LATIN1);
  return { files, root: stagedRoot };
}
