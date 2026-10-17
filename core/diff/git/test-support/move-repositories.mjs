import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { reportFromAnalyzerOutput } from '../../execution/process.mjs';
import { runQualityDiff } from '../../comparison/run-diff.mjs';
import { writeFiles } from './fixture-files.mjs';
import { copyGitTemplate, fixtureGit } from './git-repository.mjs';

const FINDING_MARKER = '// FINDING ';
const PROBE = 'probe';

export function probeAnalyzer() {
  return {
    name: PROBE,
    version: '1.0.0',
    configurationHash: PROBE,
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
        { status: 0, stdoutText, stderrText: '' },
      ),
    ];
  });
  return { reports, errors: [], timings: [] };
}

function insideRoot(root, relativePath) {
  const base = path.resolve(root);
  const full = path.resolve(base, relativePath);
  if (!full.startsWith(base + path.sep)) {
    return undefined;
  }
  return full;
}

function scan(projectRoot, sourceRoot) {
  const directory = insideRoot(projectRoot, sourceRoot);
  if (directory === undefined || !existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .map((name) => `${sourceRoot}/${name.split(path.sep).join('/')}`)
    .sort()
    .flatMap((relativePath) => findingsIn(projectRoot, relativePath));
}

function findingsIn(projectRoot, relativePath) {
  return readFileSync(insideRoot(projectRoot, relativePath), 'utf8')
    .split('\n')
    .flatMap((line, index) => {
      const marker = line.indexOf(FINDING_MARKER);
      return marker === -1
        ? []
        : [
            {
              tool: PROBE,
              rule: 'probe-rule',
              path: relativePath,
              classification: 'enforceable',
              message: 'probe finding',
              location: { line: index + 1, column: 1 },
              ...JSON.parse(line.slice(marker + FINDING_MARKER.length)),
            },
          ];
    });
}

export function finding(identity) {
  return `${FINDING_MARKER}${JSON.stringify({ identity })}\n`;
}

export function filler(name) {
  return Array.from(
    { length: 12 },
    (_, index) => `export const ${name}${String(index)} = ${String(index)};\n`,
  ).join('');
}

export function git(root, ...gitArguments) {
  return fixtureGit(root, gitArguments).trim();
}

export function createMoveRepositories() {
  const folders = { template: undefined, test: undefined };
  beforeAll(() => {
    folders.template = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-moves-template-')));
    git(folders.template, 'init', '-q', '-b', 'main');
  });
  afterEach(() => {
    if (folders.test !== undefined) {
      rmSync(folders.test, { recursive: true, force: true });
      folders.test = undefined;
    }
  });
  afterAll(() => {
    rmSync(folders.template, { recursive: true, force: true });
  });
  return (files) => {
    folders.test ??= realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-moves-')));
    const root = mkdtempSync(path.join(folders.test, 'repository-'));
    copyGitTemplate(folders.template, root);
    write(root, files);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');
    git(root, 'branch', 'base-ref');
    return root;
  };
}

export function write(root, files) {
  writeFiles(root, files);
}

export function move(root, from, to) {
  mkdirSync(path.dirname(insideRoot(root, to)), { recursive: true });
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

export function identities(findings) {
  return findings.map((entry) => entry.identity);
}
