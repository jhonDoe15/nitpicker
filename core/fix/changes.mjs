import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { normalizeGitPath, resolveComparison, runGit } from '../diff/git.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

export function collectWorkingTreeChanges({ repositoryRoot, projectRoot, baseRef }) {
  const comparison = resolveComparison(repositoryRoot, baseRef);
  const projectRepositoryPath = normalizeGitPath(path.relative(repositoryRoot, projectRoot) || '.');
  const changesByRepositoryPath = new Map();

  addNameStatusChanges({
    output: runGit(repositoryRoot, [
      'diff',
      '--find-renames',
      '--name-status',
      '-z',
      `${comparison.mergeBaseSha}...${comparison.headSha}`,
      '--',
      projectRepositoryPath,
    ]),
    source: 'committed',
    changesByRepositoryPath,
  });
  addNameStatusChanges({
    output: runGit(repositoryRoot, [
      'diff',
      '--cached',
      '--find-renames',
      '--name-status',
      '-z',
      comparison.headSha,
      '--',
      projectRepositoryPath,
    ]),
    source: 'staged',
    changesByRepositoryPath,
  });
  addNameStatusChanges({
    output: runGit(repositoryRoot, [
      'diff',
      '--find-renames',
      '--name-status',
      '-z',
      '--',
      projectRepositoryPath,
    ]),
    source: 'unstaged',
    changesByRepositoryPath,
  });

  for (const repositoryPath of splitNullTerminated(
    runGit(repositoryRoot, [
      'ls-files',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      projectRepositoryPath,
    ]),
  )) {
    addChange(changesByRepositoryPath, {
      repositoryPath,
      status: '?',
      source: 'untracked',
    });
  }

  const basePaths = finalBasePaths({
    repositoryRoot,
    mergeBaseSha: comparison.mergeBaseSha,
    projectRepositoryPath,
  });
  const changes = [...changesByRepositoryPath.values()]
    .map((change) =>
      completeChange({
        change,
        projectRoot,
        projectRepositoryPath,
        baseRepositoryPath: basePaths.get(change.repositoryPath) ?? change.repositoryPath,
      }),
    )
    .sort((left, right) => left.path.localeCompare(right.path));

  return { comparison, changes };
}

export function readBaseFiles({ repositoryRoot, mergeBaseSha, files }) {
  if (files.length === 0) {
    return new Map();
  }
  const objectNames = files.map(({ baseRepositoryPath }) => {
    if (baseRepositoryPath.includes('\n')) {
      throw new Error(`Cannot read a base path containing a newline: ${baseRepositoryPath}`);
    }
    return `${mergeBaseSha}:${baseRepositoryPath}`;
  });
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: repositoryRoot,
    input: `${objectNames.join('\n')}\n`,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `git cat-file --batch failed: ${result.stderr.toString('utf8').trim() || `exit status ${String(result.status)}`}`,
    );
  }
  return parseBatchObjects({ output: result.stdout, files, objectNames });
}

export function parseNameStatus(output) {
  const fields = output.split('\0');
  const records = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index];
    index += 1;
    if (status.length === 0) {
      continue;
    }
    const firstPath = fields[index];
    index += 1;
    if (firstPath === undefined || firstPath.length === 0) {
      throw new Error(`Malformed git status output for ${status}: missing path`);
    }
    if (status.startsWith('R') || status.startsWith('C')) {
      const secondPath = fields[index];
      index += 1;
      if (secondPath === undefined || secondPath.length === 0) {
        throw new Error(`Malformed git status output for ${status}: missing destination`);
      }
      records.push({
        status,
        previousRepositoryPath: normalizeGitPath(firstPath),
        repositoryPath: normalizeGitPath(secondPath),
      });
      continue;
    }
    records.push({ status, repositoryPath: normalizeGitPath(firstPath) });
  }
  return records;
}

function addNameStatusChanges({ output, source, changesByRepositoryPath }) {
  for (const record of parseNameStatus(output)) {
    addChange(changesByRepositoryPath, { ...record, source });
  }
}

function addChange(changesByRepositoryPath, record) {
  const repositoryPath = normalizeGitPath(record.repositoryPath);
  const existing = changesByRepositoryPath.get(repositoryPath);
  if (existing === undefined) {
    changesByRepositoryPath.set(repositoryPath, {
      repositoryPath,
      sources: new Set([record.source]),
      statuses: new Set([record.status]),
      previousRepositoryPaths:
        record.previousRepositoryPath === undefined
          ? new Set()
          : new Set([record.previousRepositoryPath]),
    });
    return;
  }
  existing.sources.add(record.source);
  existing.statuses.add(record.status);
  if (record.previousRepositoryPath !== undefined) {
    existing.previousRepositoryPaths.add(record.previousRepositoryPath);
  }
}

function finalBasePaths({ repositoryRoot, mergeBaseSha, projectRepositoryPath }) {
  const records = parseNameStatus(
    runGit(repositoryRoot, [
      'diff',
      '--find-renames',
      '--name-status',
      '-z',
      mergeBaseSha,
      '--',
      projectRepositoryPath,
    ]),
  );
  return new Map(
    records
      .filter(({ previousRepositoryPath }) => previousRepositoryPath !== undefined)
      .map(({ repositoryPath, previousRepositoryPath }) => [
        repositoryPath,
        previousRepositoryPath,
      ]),
  );
}

function completeChange({ change, projectRoot, projectRepositoryPath, baseRepositoryPath }) {
  const projectPath = relativeToProject(change.repositoryPath, projectRepositoryPath);
  const absolutePath = path.join(projectRoot, ...projectPath.split('/'));
  const isFile = existsSync(absolutePath) && lstatSync(absolutePath).isFile();
  return {
    path: projectPath,
    repositoryPath: change.repositoryPath,
    baseRepositoryPath,
    basePath: projectPathWithin(baseRepositoryPath, projectRepositoryPath) ?? projectPath,
    sources: [...change.sources].sort(),
    statuses: [...change.statuses].sort(),
    previousRepositoryPaths: [...change.previousRepositoryPaths].sort(),
    isFile,
  };
}

function relativeToProject(repositoryPath, projectRepositoryPath) {
  const projectPath = projectPathWithin(repositoryPath, projectRepositoryPath);
  if (projectPath === undefined) {
    throw new Error(`Git returned path outside the project root: ${repositoryPath}`);
  }
  return projectPath;
}

function projectPathWithin(repositoryPath, projectRepositoryPath) {
  if (projectRepositoryPath === '.') {
    return repositoryPath;
  }
  const prefix = `${projectRepositoryPath}/`;
  return repositoryPath.startsWith(prefix) ? repositoryPath.slice(prefix.length) : undefined;
}

function splitNullTerminated(output) {
  return output
    .split('\0')
    .filter((value) => value.length > 0)
    .map((value) => normalizeGitPath(value));
}

function parseBatchObjects({ output, files, objectNames }) {
  const contents = new Map();
  let offset = 0;
  for (let index = 0; index < files.length; index += 1) {
    const lineEnd = output.indexOf(10, offset);
    if (lineEnd === -1) {
      throw new Error('Malformed git cat-file output: missing object header');
    }
    const header = output.subarray(offset, lineEnd).toString('utf8');
    offset = lineEnd + 1;
    if (header === `${objectNames[index]} missing`) {
      contents.set(files[index].path, undefined);
      continue;
    }
    const fields = header.split(' ');
    const size = Number(fields[2]);
    if (fields.length !== 3 || fields[1] !== 'blob' || !Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Malformed git cat-file object header: ${header}`);
    }
    const contentEnd = offset + size;
    if (contentEnd >= output.length || output[contentEnd] !== 10) {
      throw new Error(`Malformed git cat-file content for ${files[index].baseRepositoryPath}`);
    }
    contents.set(files[index].path, output.subarray(offset, contentEnd).toString('utf8'));
    offset = contentEnd + 1;
  }
  if (offset !== output.length) {
    throw new Error('Malformed git cat-file output: unexpected trailing data');
  }
  return contents;
}
