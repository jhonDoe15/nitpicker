import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { reportFromAnalyzerOutput } from '../../execution/process.mjs';
import { runQualityDiff } from '../../comparison/run-diff.mjs';

export function probeAnalyzer() {
  return {
    name: 'probe',
    version: '1.0.0',
    configurationHash: 'probe',
    exclusions: [],
    createInvocation: ({ projectRoot }) => ({
      command: process.execPath,
      args: [projectRoot],
    }),
  };
}

function runProbe(tasks, policyFile) {
  const policy = policyFile === undefined ? {} : JSON.parse(readFileSync(policyFile, 'utf8'));
  const sourceRoots = policy.layout?.sourceRoots ?? ['src'];
  const reports = tasks.map((task) => {
    const [projectRoot] = task.invocation.args;
    const findings = sourceRoots.flatMap((root) => scan(projectRoot, root));
    const stdoutText = JSON.stringify({ findings });
    return [
      task.name,
      reportFromAnalyzerOutput(
        { ...task, acceptedExitCodes: [0] },
        { status: 0, signal: null, stdoutText, stderrText: '' },
      ),
    ];
  });
  return { reports, errors: [], timings: [] };
}

function scan(projectRoot, relativeDirectory) {
  const directory = path.join(projectRoot, relativeDirectory);
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      return scan(projectRoot, relativePath);
    }
    return readFileSync(path.join(projectRoot, relativePath), 'utf8')
      .split('\n')
      .flatMap((line, index) => {
        const marker = line.indexOf('// FINDING ');
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
                ...JSON.parse(line.slice(marker + '// FINDING '.length)),
              },
            ];
      });
  });
}

export const finding = (identity) => `// FINDING ${JSON.stringify({ identity })}\n`;
export const filler = (name) =>
  Array.from(
    { length: 12 },
    (_, index) => `export const ${name}${String(index)} = ${String(index)};\n`,
  ).join('');

const HERMETIC_GIT_ENVIRONMENT = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

export function git(root, ...arguments_) {
  return execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...arguments_],
    { cwd: root, encoding: 'utf8', env: HERMETIC_GIT_ENVIRONMENT },
  ).trim();
}

export function createMoveRepositories() {
  const repositories = [];
  const template = { root: undefined };
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
  return (files) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-moves-')));
    repositories.push(root);
    cpSync(path.join(template.root, '.git'), path.join(root, '.git'), {
      recursive: true,
    });
    write(root, files);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');
    git(root, 'branch', 'base-ref');
    return root;
  };
}

export function write(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), contents);
  }
}

export function move(root, from, to) {
  mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
  git(root, 'mv', from, to);
}

export function commitHead(root) {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'head');
}

export function compare(
  root,
  { projectRelativePath = '.', headPolicy, resolveBaseSetup, describeNotices } = {},
) {
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

export const identities = (findings) => findings.map((entry) => entry.identity);
