import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GitCommandError, runGit } from '../../../git/repository/command.mjs';
import { readBlobTexts } from '../../../git/repository/blobs.mjs';
import { JVM_SOURCE, declaredPackage } from './declared-package.mjs';

const TREE_ENTRY = /^\S+ \S+ (\S+)\t([\s\S]*)$/u;
const MAX_CANDIDATES = 20_000;
const NO_MATCH_STATUS = 1;

function insideScope(scope) {
  return scope === '' ? '' : `${scope}/`;
}

export function treeEntries({ repositoryRoot, sha, scope }) {
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
    output
      .split('\0')
      .map((line) => TREE_ENTRY.exec(line))
      .filter((match) => match !== null && match[2].startsWith(prefix))
      .map((match) => [match[2].slice(prefix.length), match[1]]),
  );
}

export function textsOf(side, files) {
  const shas = new Map(
    files.flatMap((file) => (side.tree.has(file) ? [[file, side.tree.get(file)]] : [])),
  );
  const texts = readBlobTexts(side.repositoryRoot, [...shas.values()]);
  return new Map(
    [...shas].filter(([, sha]) => texts.has(sha)).map(([file, sha]) => [file, texts.get(sha)]),
  );
}

export function packagesOf(side, files) {
  return new Map(
    [...textsOf(side, files)]
      .map(([file, text]) => [file, declaredPackage(text)])
      .filter(([, name]) => name !== undefined),
  );
}

function lastSegments(names) {
  return [...new Set(names.map((name) => name.split('.').at(-1)).filter((part) => part !== ''))];
}

export function filesMentioning(side, names) {
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

export function isJvm(file) {
  return JVM_SOURCE.test(file);
}
