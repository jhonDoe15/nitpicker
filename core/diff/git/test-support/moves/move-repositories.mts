import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { reportFromAnalyzerOutput } from '../../../execution/report/analyzer-report.mts';
import { type DiffOptions, runQualityDiff } from '../../../comparison/run-diff.mts';
import { type FileMap, writeFiles } from '../fixture-files.mts';
import { copyGitTemplate, fixtureGit } from '../git-repository.mts';
import type { DiffReport } from '../../../comparison/results.mts';
import type { AnalyzerTask } from '../../../execution/tasks.mts';
import type { ProfiledAnalyzer } from '../../../../../shared/values/analyzers.mts';
import { fieldAt } from '../../../../../scripts/json/fields.mts';
import {
  fieldOf,
  fieldsOf,
  parseJson,
  textOf,
  textsOf,
} from '../../../../../shared/values/readers.mts';

const FINDING_MARKER = '// FINDING ';

type ProbeTask = Pick<AnalyzerTask, 'name' | 'acceptedExitCodes' | 'reportedTools' | 'invocation'>;

export function probeAnalyzer(): ProfiledAnalyzer {
  const analyzer = {
    name: 'probe',
    version: '1.0.0',
    configurationHash: 'probe',
    exclusions: [],
    createInvocation: (context: unknown) => ({
      command: process.execPath,
      args: [textOf(fieldOf(context, 'projectRoot'))],
    }),
  };
  return analyzer;
}

function runProbe(tasks: readonly ProbeTask[], policyFile: string | undefined) {
  const policy: unknown =
    policyFile === undefined ? {} : parseJson(readFileSync(policyFile, 'utf8'));
  const configuredRoots = fieldAt(policy, 'layout', 'sourceRoots');
  const sourceRoots = configuredRoots === undefined ? ['src'] : textsOf(configuredRoots);
  const configuredSkipped = fieldAt(policy, 'duplicates', 'skippedFolders');
  const skipped = configuredSkipped === undefined ? ['dist'] : textsOf(configuredSkipped);
  const reports = tasks.map((task) => {
    const [projectRoot = ''] = task.invocation.args;
    const findings = sourceRoots.flatMap((root) => scan(projectRoot, root, skipped));
    const stdoutText = JSON.stringify({ findings });
    return [
      task.name,
      reportFromAnalyzerOutput(
        { ...task, acceptedExitCodes: [0] },
        { status: 0, signal: undefined, stdoutText, stderrText: '' },
      ),
    ];
  });
  return { reports, errors: [], timings: [] };
}

function insideRoot(root: string, relativePath: string): string | undefined {
  const base = path.resolve(root);
  const full = path.resolve(base, relativePath);
  if (!full.startsWith(base + path.sep)) {
    return undefined;
  }
  return full;
}

function requiredInside(root: string, relativePath: string): string {
  const full = insideRoot(root, relativePath);
  if (full === undefined) {
    throw new Error(`${relativePath} escapes ${root}`);
  }
  return full;
}

function scan(projectRoot: string, sourceRoot: string, skipped: readonly string[]) {
  const directory = insideRoot(projectRoot, sourceRoot);
  if (directory === undefined || !existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { recursive: true })
    .map((name) => `${sourceRoot}/${String(name).split(path.sep).join('/')}`)
    .filter(
      (relativePath) =>
        !relativePath
          .split('/')
          .slice(0, -1)
          .some((part) => skipped.includes(part)),
    )
    .filter((relativePath) => statSync(requiredInside(projectRoot, relativePath)).isFile())
    .sort()
    .flatMap((relativePath) => findingsIn(projectRoot, relativePath));
}

function findingsIn(projectRoot: string, relativePath: string) {
  return readFileSync(requiredInside(projectRoot, relativePath), 'utf8')
    .split('\n')
    .flatMap((line, index) => {
      const marker = line.indexOf(FINDING_MARKER);
      return marker === -1
        ? []
        : [
            {
              tool: 'probe',
              rule: 'probe-rule',
              path: relativePath,
              classification: 'enforceable',
              message: 'probe finding',
              location: { line: index + 1, column: 1 },
              ...fieldsOf(parseJson(line.slice(marker + FINDING_MARKER.length))),
            },
          ];
    });
}

export function finding(identity: string): string {
  return `${FINDING_MARKER}${JSON.stringify({ identity })}\n`;
}

export function filler(name: string): string {
  return Array.from(
    { length: 12 },
    (_, index) => `export const ${name}${String(index)} = ${String(index)};\n`,
  ).join('');
}

export function git(root: string, ...gitArguments: readonly string[]): string {
  return fixtureGit(root, gitArguments).trim();
}

export function createMoveRepositories(): (files: FileMap) => string {
  const repositories: string[] = [];
  const template = { root: '' };
  beforeAll(() => {
    template.root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-moves-template-')));
    git(template.root, 'init', '-q', '-b', 'main');
  });
  afterEach(() => {
    for (const root of repositories.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  afterAll(() => {
    rmSync(template.root, { recursive: true, force: true });
  });
  return (files: FileMap) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-moves-')));
    repositories.push(root);
    copyGitTemplate(template.root, root);
    write(root, files);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');
    git(root, 'branch', 'base-ref');
    return root;
  };
}

export function write(root: string, files: FileMap): void {
  writeFiles(root, files);
}

export function move(root: string, from: string, to: string): void {
  mkdirSync(path.dirname(requiredInside(root, to)), { recursive: true });
  git(root, 'mv', from, to);
}

export function commitHead(root: string): void {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'head');
}

export function compare(
  root: string,
  {
    projectRelativePath = '.',
    headPolicy,
    resolveBaseSetup,
    describeNotices,
  }: {
    readonly projectRelativePath?: string;
    readonly headPolicy?: unknown;
    readonly resolveBaseSetup?: DiffOptions['resolveBaseSetup'];
    readonly describeNotices?: DiffOptions['describeNotices'];
  } = {},
): DiffReport {
  return runQualityDiff({
    repositoryRoot: root,
    projectRelativePath,
    headProjectRoot: path.join(root, projectRelativePath),
    requestedBaseRef: 'base-ref',
    outputRoot: path.join(root, 'reports'),
    analyzers: [probeAnalyzer()],
    headPolicy,
    resolveBaseSetup,
    describeNotices,
    runTasks: runProbe,
  });
}

export function identities(findings: readonly unknown[]): string[] {
  return findings.map((entry) => textOf(fieldOf(entry, 'identity')));
}
