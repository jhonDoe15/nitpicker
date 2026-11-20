import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GitCommandError, runGit } from '../../../git/repository/command.mts';
import { readBlobTexts } from '../../../git/repository/blobs.mts';
import { JVM_SOURCE, declaredPackage } from './declared-package.mts';

const TREE_ENTRY = /^\S+ \S+ (\S+)\t([\s\S]*)$/u;
const MAX_CANDIDATES = 20_000;
const NO_MATCH_STATUS = 1;

export type TreeSide = {
  readonly repositoryRoot: string;
  readonly sha: string;
  readonly scope: string;
  readonly tree: ReadonlyMap<string, string>;
};

function insideScope(scope: string): string {
  return scope === '' ? '' : `${scope}/`;
}

export function treeEntries({
  repositoryRoot,
  sha,
  scope,
}: {
  readonly repositoryRoot: string;
  readonly sha: string;
  readonly scope: string;
}): Map<string, string> {
  const prefix = insideScope(scope);
  const output = runGit(repositoryRoot, [
    'ls-tree',
    '-r',
    '-z',
    sha,
    '--',
    scope === '' ? '.' : scope,
  ]);
  return new Map(
    output.split('\0').flatMap((line): [string, string][] => {
      const match = TREE_ENTRY.exec(line);
      const entrySha = match?.[1];
      const file = match?.[2];
      return entrySha !== undefined && file?.startsWith(prefix) === true
        ? [[file.slice(prefix.length), entrySha]]
        : [];
    }),
  );
}

export function textsOf(side: TreeSide, files: readonly string[]): Map<string, string> {
  const shas = new Map(
    files.flatMap((file): [string, string][] => {
      const sha = side.tree.get(file);
      return sha === undefined ? [] : [[file, sha]];
    }),
  );
  const texts = readBlobTexts(side.repositoryRoot, [...shas.values()]);
  return new Map(
    [...shas].flatMap(([file, sha]): [string, string][] => {
      const text = texts.get(sha);
      return text === undefined ? [] : [[file, text]];
    }),
  );
}

export function packagesOf(side: TreeSide, files: readonly string[]): Map<string, string> {
  return new Map(
    [...textsOf(side, files)].flatMap(([file, text]): [string, string][] => {
      const name = declaredPackage(text);
      return name === undefined ? [] : [[file, name]];
    }),
  );
}

function lastSegments(names: readonly string[]): string[] {
  return [
    ...new Set(names.flatMap((name) => name.split('.').at(-1) ?? []).filter((part) => part !== '')),
  ];
}

export function filesMentioning(side: TreeSide, names: readonly string[]): string[] | undefined {
  const patterns = lastSegments(names);
  if (patterns.length === 0) {
    return [];
  }
  const { repositoryRoot, sha, scope } = side;
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-package-grep-'));
  try {
    const patternFile = path.join(directory, 'patterns');
    writeFileSync(patternFile, `${patterns.join('\n')}\n`);
    const output = runGit(repositoryRoot, [
      '--literal-pathspecs',
      'grep',
      '-F',
      '-l',
      '-z',
      '-f',
      patternFile,
      sha,
      '--',
      ...(scope === '' ? [] : [scope]),
    ]);
    const prefix = `${sha}:${insideScope(scope)}`;
    const files = output
      .split('\0')
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => entry.slice(prefix.length))
      .filter((file) => JVM_SOURCE.test(file));
    return files.length > MAX_CANDIDATES ? undefined : files;
  } catch (error) {
    return error instanceof GitCommandError && error.exitCode === NO_MATCH_STATUS ? [] : undefined;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function isJvm(file: string): boolean {
  return JVM_SOURCE.test(file);
}
