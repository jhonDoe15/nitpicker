import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from './tool-steps/paths/contained-path.mts';
import { normalizeGitPath } from '../diff/git/normalize.mts';
import { resolveComparison } from '../diff/git/repository/git.mts';
import { runGit } from '../diff/git/repository/command.mts';
import { GIT_TIMEOUT_MS } from '../../shared/processes/deadlines.mjs';
import { parseBatchObjects } from './cat-file/batch-objects.mts';
import type { Comparison } from '../diff/git/repository/git.mts';
import type {
  ChangeRecord,
  ChangeSource,
  CollectRequest,
  CompleteRequest,
  FinalBaseRequest,
  NameStatusRequest,
  PendingChange,
  ReadBaseRequest,
  StatusRecord,
  UntrackedRequest,
  WorkingTreeChange,
} from './typed/edit-types.mts';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

function nameStatusSources(
  comparison: Comparison,
  projectRepositoryPath: string,
): { source: ChangeSource; args: string[] }[] {
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

function addUntrackedChanges({
  repositoryRoot,
  projectRepositoryPath,
  changesByRepositoryPath,
}: UntrackedRequest): void {
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

export function collectWorkingTreeChanges({
  repositoryRoot,
  projectRoot,
  baseRef,
}: CollectRequest): { comparison: Comparison; changes: WorkingTreeChange[] } {
  const comparison = resolveComparison(repositoryRoot, baseRef);
  const projectRepositoryPath = normalizeGitPath(path.relative(repositoryRoot, projectRoot) || '.');
  const changesByRepositoryPath = new Map<string, PendingChange>();

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

export function readBaseFiles({
  repositoryRoot,
  mergeBaseSha,
  files,
}: ReadBaseRequest): Map<string, string | undefined> {
  if (files.length === 0) {
    return new Map<string, string | undefined>();
  }
  const objectNames = files.map(({ baseRepositoryPath }) => {
    if (baseRepositoryPath.includes('\n')) {
      throw new Error(`Cannot read a base path containing a newline: ${baseRepositoryPath}`);
    }
    return `${String(mergeBaseSha)}:${baseRepositoryPath}`;
  });
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: repositoryRoot,
    input: `${objectNames.join('\n')}\n`,
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: GIT_TIMEOUT_MS,
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

function requireStatusPath(value: string | undefined, status: string, description: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Malformed git status output for ${status}: missing ${description}`);
  }
  return value;
}

function parseStatusRecord(status: string, remaining: ArrayIterator<string>): StatusRecord {
  const firstPath = requireStatusPath(remaining.next().value, status, 'path');
  if (!(status.startsWith('R') || status.startsWith('C'))) {
    return { status, repositoryPath: normalizeGitPath(firstPath) };
  }
  const secondPath = requireStatusPath(remaining.next().value, status, 'destination');
  return {
    status,
    previousRepositoryPath: normalizeGitPath(firstPath),
    repositoryPath: normalizeGitPath(secondPath),
  };
}

function parseNameStatus(output: string): StatusRecord[] {
  const records: StatusRecord[] = [];
  const remaining = output.split('\0').values();
  for (const status of remaining) {
    if (status.length > 0) {
      records.push(parseStatusRecord(status, remaining));
    }
  }
  return records;
}

function addNameStatusChanges({
  output,
  source,
  changesByRepositoryPath,
}: NameStatusRequest): void {
  for (const record of parseNameStatus(output)) {
    addChange(changesByRepositoryPath, { ...record, source });
  }
}

function addChange(
  changesByRepositoryPath: Map<string, PendingChange>,
  record: ChangeRecord,
): void {
  const repositoryPath = normalizeGitPath(record.repositoryPath);
  const existing = changesByRepositoryPath.get(repositoryPath);
  if (existing === undefined) {
    changesByRepositoryPath.set(repositoryPath, {
      repositoryPath,
      sources: new Set([record.source]),
      statuses: new Set([record.status]),
      previousRepositoryPaths:
        record.previousRepositoryPath === undefined
          ? new Set<string>()
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

function finalBasePaths({
  repositoryRoot,
  mergeBaseSha,
  projectRepositoryPath,
}: FinalBaseRequest): Map<string, string> {
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
  const basePaths = new Map<string, string>();
  for (const { repositoryPath, previousRepositoryPath } of records) {
    if (previousRepositoryPath !== undefined) {
      basePaths.set(repositoryPath, previousRepositoryPath);
    }
  }
  return basePaths;
}

function completeChange({
  change,
  projectRoot,
  projectRepositoryPath,
  baseRepositoryPath,
}: CompleteRequest): WorkingTreeChange {
  const projectPath = relativeToProject(change.repositoryPath, projectRepositoryPath);
  const absolutePath = containedPath(projectRoot, projectPath);
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

function relativeToProject(repositoryPath: string, projectRepositoryPath: string): string {
  const projectPath = projectPathWithin(repositoryPath, projectRepositoryPath);
  if (projectPath === undefined) {
    throw new Error(`Git returned path outside the project root: ${repositoryPath}`);
  }
  return projectPath;
}

function projectPathWithin(
  repositoryPath: string,
  projectRepositoryPath: string,
): string | undefined {
  if (projectRepositoryPath === '.') {
    return repositoryPath;
  }
  const prefix = `${projectRepositoryPath}/`;
  return repositoryPath.startsWith(prefix) ? repositoryPath.slice(prefix.length) : undefined;
}

function splitNullTerminated(output: string): string[] {
  return output
    .split('\0')
    .filter((value) => value.length > 0)
    .map((value) => normalizeGitPath(value));
}
