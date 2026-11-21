import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mts';
import { runCli } from '../../../../../core/cli.mts';
import { schemaChecked } from '../../../../../core/diff/comparison/test-support/findings-schema-check.mts';
import { withoutHelpUris } from '../../../../../core/diff/reporting/test-support/report-reading.mts';
import { fileURLToPath } from 'node:url';
import type {
  BranchSpec,
  Files,
  Finding,
  GateOptions,
  GateResult,
  Summary,
} from './python-e2e-types.mts';
import { summarize } from '../../../../../shared/test-support/findings-by-rule.mts';

function isReport(value: unknown): value is Summary | Finding[] {
  return typeof value === 'object' && value !== null;
}

function withoutHelp(report: unknown): Summary | Finding[] {
  const cleaned = withoutHelpUris(report);
  if (!isReport(cleaned)) {
    throw new Error('a report file holds no JSON object or array');
  }
  return cleaned;
}

const LOCAL_COMMAND_TIMEOUT_MS = 30_000;
const PROVISIONING_TIMEOUT_MS = 120_000;
const UV_PROVISIONING_COMMANDS = new Set(['lock', 'sync', 'pip']);

export const fixture = path.resolve(
  fileURLToPath(new URL('../../', import.meta.url)),
  'fixtures/python-project',
);

const gitEnvironment = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

export function command(cwd: string, program: string, args: readonly string[]): void {
  const timeout =
    program === 'uv' && UV_PROVISIONING_COMMANDS.has(args[0] ?? '')
      ? PROVISIONING_TIMEOUT_MS
      : LOCAL_COMMAND_TIMEOUT_MS;
  const result = spawnSync(program, args, {
    cwd,
    encoding: 'utf8',
    env: gitEnvironment,
    timeout,
  });
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(' ')} failed: ${result.stderr}${result.stdout}`);
  }
}

export function git(root: string, ...args: readonly string[]): void {
  command(root, 'git', args);
}

export function write(root: string, files: Files): void {
  writeFiles(root, files);
}

export function commitBranchFrom({ root, name, files, from }: BranchSpec): void {
  git(root, 'checkout', '-q', '-b', name, from);
  write(root, files);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', name);
}

export function commitBranch(root: string, name: string, files: Files): void {
  commitBranchFrom({ root, name, files, from: 'main' });
}

export function gate(
  root: string,
  branch: string,
  { extra = [], environment = {}, base = 'main' }: GateOptions = {},
): GateResult {
  git(root, 'checkout', '-q', branch);
  const reports = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-e2e-out-'));
  const output = { text: '' };
  const exitCode = runCli({
    arguments_: ['--base', base, '--output', reports, ...extra],
    environment: { NO_COLOR: '1', ...environment },
    currentProjectRoot: root,
    stdout: {
      write: (value: string) => {
        output.text += value;
      },
    },
    stderr: {
      write: (value: string) => {
        output.text += value;
      },
    },
    progress: { write: () => undefined },
  });
  function json(name: 'summary.json'): Summary;
  function json(name: string): Finding[];
  function json(name: string): Summary | Finding[] {
    const file = path.resolve(reports, name);
    if (!file.startsWith(reports + path.sep)) {
      throw new Error(`${name} is outside the reports directory`);
    }
    return withoutHelp(JSON.parse(readFileSync(file, 'utf8')));
  }
  if (existsSync(path.join(reports, 'new-findings.json'))) {
    schemaChecked({ newFindings: json('new-findings.json') });
  }
  return {
    exitCode,
    json,
    get text() {
      return output.text;
    },
    reports,
  };
}

export async function settledGate(
  root: string,
  branch: string,
  options: GateOptions = {},
): Promise<GateResult & { readonly exitCode: number }> {
  const result = gate(root, branch, options);
  const exitCode = await result.exitCode;
  return { ...result, exitCode };
}

export function initializeRepository(root: string, message: string): void {
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
}

export function installPackages(root: string, packages: readonly string[]): void {
  command(root, 'uv', ['venv', '-q', '.venv']);
  command(root, 'uv', ['pip', 'install', '-q', '--python', '.venv', ...packages]);
}

type Repositories = {
  readonly repository: () => string;
  readonly removeRepositories: () => void;
  readonly fixtureRepository: (packages: readonly string[]) => string;
};

export function useRepositories(): Repositories {
  const repositoriesRoot = path.join(
    realpathSync(tmpdir()),
    `nitpicker-python-e2e-${randomUUID()}`,
  );

  function repository(): string {
    const root = path.join(repositoriesRoot, randomUUID());
    mkdirSync(root, { recursive: true });
    return root;
  }

  function removeRepositories(): void {
    rmSync(repositoriesRoot, { recursive: true, force: true });
  }

  function fixtureRepository(packages: readonly string[]): string {
    const root = repository();
    cpSync(fixture, root, { recursive: true });
    initializeRepository(root, 'base with one legacy violation');
    installPackages(root, ['-e', '.', ...packages]);
    return root;
  }

  return { repository, removeRepositories, fixtureRepository };
}

export { summarize };
