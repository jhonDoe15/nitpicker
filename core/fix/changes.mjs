import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { normalizeGitPath } from '../diff/git/normalize.mjs';
import { resolveComparison } from '../diff/git/repository/git.mjs';
import { runGit } from '../diff/git/repository/command.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

function nameStatusSources(comparison, projectRepositoryPath) {
  const rename = ['--find-renames', '--name-status', '-z'];
  return [
    {
      source: 'committed',
      args: [
        'diff',
        ...rename,
        `${comparison.mergeBaseSha}...${comparison.headSha}`,
        '--',
        projectRepositoryPath,
      ],
    },
    {
      source: 'staged',
      args: ['diff', '--cached', ...rename, comparison.headSha, '--', projectRepositoryPath],
    },
    { source: 'unstaged', args: ['diff', ...rename, '--', projectRepositoryPath] },
  ];
}

function addUntrackedChanges({ repositoryRoot, projectRepositoryPath, changesByRepositoryPath }) {
  const output = runGit(repositoryRoot, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    projectRepositoryPath,
  ]);
  for (const repositoryPath of splitNullTerminated(output)) {
    addChange(changesByRepositoryPath, { repositoryPath, status: '?', source: 'untracked' });
  }
}

export function collectWorkingTreeChanges({ repositoryRoot, projectRoot, baseRef }) {
  const comparison = resolveComparison(repositoryRoot, baseRef);
  const projectRepositoryPath = normalizeGitPath(path.relative(repositoryRoot, projectRoot) || '.');
  const changesByRepositoryPath = new Map();

  for (const { source, args } of nameStatusSources(comparison, projectRepositoryPath)) {
    addNameStatusChanges({
      output: runGit(repositoryRoot, args),
      source,
      changesByRepositoryPath,
    });
  }
  addUntrackedChanges({ repositoryRoot, projectRepositoryPath, changesByRepositoryPath });

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

function requireStatusPath(value, status, description) {
  if (value === undefined || value.length === 0) {
    throw new Error(`Malformed git status output for ${status}: missing ${description}`);
  }
  return value;
}

function parseStatusRecord(status, remaining) {
  const firstPath = requireStatusPath(remaining.next().value, status, 'path');
  if (!status.startsWith('R') && !status.startsWith('C')) {
    return { status, repositoryPath: normalizeGitPath(firstPath) };
  }
  const secondPath = requireStatusPath(remaining.next().value, status, 'destination');
  return {
    status,
    previousRepositoryPath: normalizeGitPath(firstPath),
    repositoryPath: normalizeGitPath(secondPath),
  };
}

function parseNameStatus(output) {
  const records = [];
  const remaining = output.split('\0').values();
  for (const status of remaining) {
    if (status.length > 0) {
      records.push(parseStatusRecord(status, remaining));
    }
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

function readBatchHeader(output, offset) {
  const lineEnd = output.indexOf(10, offset);
  if (lineEnd === -1) {
    throw new Error('Malformed git cat-file output: missing object header');
  }
  return { header: output.subarray(offset, lineEnd).toString('utf8'), next: lineEnd + 1 };
}

function parseBlobSize(header) {
  const fields = header.split(' ');
  const size = Number(fields[2]);
  if (fields.length !== 3 || fields[1] !== 'blob' || !Number.isSafeInteger(size) || size < 0) {
    throw new Error(`Malformed git cat-file object header: ${header}`);
  }
  return size;
}

function readBatchObject({ output, offset, file, objectName }) {
  const { header, next } = readBatchHeader(output, offset);
  if (header === `${objectName} missing`) {
    return { content: undefined, next };
  }
  const contentEnd = next + parseBlobSize(header);
  if (contentEnd >= output.length || output[contentEnd] !== 10) {
    throw new Error(`Malformed git cat-file content for ${file.baseRepositoryPath}`);
  }
  return { content: output.subarray(next, contentEnd).toString('utf8'), next: contentEnd + 1 };
}

function parseBatchObjects({ output, files, objectNames }) {
  const contents = new Map();
  let offset = 0;
  for (const [index, file] of files.entries()) {
    const object = readBatchObject({ output, offset, file, objectName: objectNames[index] });
    contents.set(file.path, object.content);
    offset = object.next;
  }
  if (offset !== output.length) {
    throw new Error('Malformed git cat-file output: unexpected trailing data');
  }
  return contents;
}
