import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runGit } from '../../git/repository/command.mjs';

const MAX_HASHED_BYTES = 1024 * 1024;
const DEFAULT_OUTPUT_PARENT = 'reports/quality';

function insideRepository(repositoryRoot, directory) {
  const relative = path.relative(repositoryRoot, directory);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function outputExclusions(repositoryRoot, projectRoot, outputRoot) {
  return [path.resolve(projectRoot, outputRoot), path.resolve(projectRoot, DEFAULT_OUTPUT_PARENT)]
    .filter((directory) => insideRepository(repositoryRoot, directory))
    .map((directory) => path.relative(repositoryRoot, directory).split(path.sep).join('/'));
}

function isExcluded(file, exclusions) {
  const name = file.replace(/\/$/u, '');
  return exclusions.some((skipped) => name === skipped || name.startsWith(`${skipped}/`));
}

function untrackedFiles(repositoryRoot, exclusions) {
  return runGit(repositoryRoot, ['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter((file) => file !== '' && !isExcluded(file, exclusions));
}

function fingerprint(repositoryRoot, file) {
  const full = path.resolve(repositoryRoot, file);
  const relative = path.relative(repositoryRoot, full);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { kind: 'outside', value: '' };
  }
  try {
    const stat = lstatSync(full);
    if (stat.isFile() && stat.size <= MAX_HASHED_BYTES) {
      return {
        kind: 'content',
        value: createHash('sha256').update(readFileSync(full)).digest('hex'),
      };
    }
    return { kind: 'stat', value: `${String(stat.size)}:${String(stat.mtimeMs)}` };
  } catch (error) {
    return { kind: 'unreadable', value: error instanceof Error ? error.name : '' };
  }
}

function computeDigest(projectRoot, outputRoot) {
  const repositoryRoot = runGit(projectRoot, ['rev-parse', '--show-toplevel']).trim();
  const exclusions = outputExclusions(repositoryRoot, projectRoot, outputRoot);
  const hash = createHash('sha256');
  hash.update(runGit(repositoryRoot, ['rev-parse', 'HEAD']));
  hash.update(
    runGit(repositoryRoot, [
      'diff',
      'HEAD',
      '--no-ext-diff',
      '--',
      '.',
      ...exclusions.map((skipped) => `:(exclude)${skipped}`),
    ]),
  );
  for (const file of untrackedFiles(repositoryRoot, exclusions)) {
    const { kind, value } = fingerprint(repositoryRoot, file);
    hash.update(`\0${file}\0${kind}:${value}`);
  }
  return hash.digest('hex');
}

export function workingTreeDigest(projectRoot, outputRoot) {
  try {
    return { kind: 'digest', value: computeDigest(projectRoot, outputRoot) };
  } catch (error) {
    return { kind: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
  }
}

export function runStamp({ projectRoot, outputRoot, now = new Date() }) {
  const workingTree = workingTreeDigest(projectRoot, outputRoot);
  return {
    generatedAt: now.toISOString(),
    ...(workingTree.kind === 'digest' ? { workingTree: workingTree.value } : {}),
  };
}
