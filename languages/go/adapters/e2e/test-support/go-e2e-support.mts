import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../../../../../core/cli.mts';
import { pathInside } from '../../../../../shared/filesystem.mjs';
import {
  fieldOf,
  listOf,
  numberOr,
  parseJson,
  textOf,
} from '../../../../../shared/values/readers.mts';

type ReportedFinding = {
  tool: string;
  rule: string;
  path: string;
  classification: string;
  message: string;
  location: { line: number };
};
export type GateResult = {
  exitCode: number | Promise<number>;
  json: (name: string) => unknown;
  findings: (name: string) => ReportedFinding[];
  text: string;
};

const COMMAND_TIMEOUT_MS = 180_000;
const GIT_SETTINGS = [
  '-c',
  'user.name=test',
  '-c',
  'user.email=test@example.com',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/dev/null',
];

export function command(cwd: string, program: string, args: readonly string[]): string {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', timeout: COMMAND_TIMEOUT_MS });
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(' ')} failed: ${result.stderr}${result.stdout}`);
  }
  return result.stdout;
}

function git(root: string, ...args: string[]) {
  command(root, 'git', [...GIT_SETTINGS, ...args]);
}

function write(root: string, files: Readonly<Record<string, string>>) {
  for (const [file, content] of Object.entries(files)) {
    const target = pathInside(root, file);
    if (target === undefined) {
      throw new Error(`${file} is outside ${root}`);
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

export function createWorkspace(): string {
  return realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-go-e2e-')));
}

export function removeWorkspace(workspace: string): void {
  rmSync(workspace, { recursive: true, force: true });
}

export function temporaryDirectory(workspace: string, prefix: string): string {
  return mkdtempSync(path.join(workspace, prefix));
}

export function goRepository(workspace: string, files: Readonly<Record<string, string>>): string {
  const root = temporaryDirectory(workspace, 'repository-');
  write(root, files);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

export function commitBranch(
  root: string,
  name: string,
  files: Readonly<Record<string, string>>,
): void {
  git(root, 'checkout', '-q', '-b', name, 'main');
  write(root, files);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', name);
}

export function gate(root: string, branch: string): GateResult {
  git(root, 'checkout', '-q', branch);
  const reports = mkdtempSync(`${root}-reports-`);
  const output = { text: '' };
  const sink = {
    write(value: string) {
      output.text += value;
    },
  };
  const exitCode = runCli({
    arguments_: ['--base', 'main', '--output', reports],
    environment: { NO_COLOR: '1' },
    currentProjectRoot: root,
    stdout: sink,
    stderr: sink,
    progress: { write: () => undefined },
  });
  function json(name: string): unknown {
    const file = pathInside(reports, name);
    if (file === undefined) {
      throw new Error(`${name} is outside ${reports}`);
    }
    return parseJson(readFileSync(file, 'utf8'));
  }
  function findings(name: string): ReportedFinding[] {
    return listOf(json(name)).map((entry) => ({
      tool: textOf(fieldOf(entry, 'tool')),
      rule: textOf(fieldOf(entry, 'rule')),
      path: textOf(fieldOf(entry, 'path')),
      classification: textOf(fieldOf(entry, 'classification')),
      message: textOf(fieldOf(entry, 'message')),
      location: { line: numberOr(fieldOf(fieldOf(entry, 'location'), 'line'), 0) },
    }));
  }
  return { exitCode, json, findings, text: output.text };
}

function summary({ tool, rule, path: file }: ReportedFinding): string {
  return `${tool}/${rule} ${file}`;
}

export function newFindings(result: GateResult): string[] {
  return result
    .findings('new-findings.json')
    .filter((finding) => finding.classification === 'enforceable')
    .map(summary)
    .sort();
}

export function newMessages(result: GateResult): string[] {
  return result
    .findings('new-findings.json')
    .filter((finding) => finding.classification === 'enforceable')
    .map(({ message }) => message);
}

export function toolErrors(result: GateResult): string[] {
  return result.findings('tool-errors.json').map(summary).sort();
}

export function toolErrorMessages(result: GateResult): string[] {
  return result.findings('tool-errors.json').map(({ message }) => message);
}
