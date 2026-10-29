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
import { reportFromAnalyzerOutput } from '../../execution/process.mjs';
import { runQualityDiff } from '../../comparison/run-diff.mjs';
import { writeFiles } from './fixture-files.mjs';
import { copyGitTemplate, fixtureGit } from './git-repository.mjs';

const FINDING_MARKER = '// FINDING ';

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
  const skipped = policy.duplicates?.skippedFolders ?? ['dist'];
  const reports = tasks.map((task) => {
    const [projectRoot] = task.invocation.args;
    const findings = sourceRoots.flatMap((root) => scan(projectRoot, root, skipped));
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

function scan(projectRoot, sourceRoot, skipped) {
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
    .filter((relativePath) => statSync(insideRoot(projectRoot, relativePath)).isFile())
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
              tool: 'probe',
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
    copyGitTemplate(template.root, root);
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
