import { expectedOutput333_22 } from '../fixtures/expected-output/core-diff-moves-diff.mjs';
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
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createBaseSetupResolver } from '../../configuration/base-setup.mjs';
import { reportFromAnalyzerOutput } from '../execution/process.mjs';
import { runQualityDiff } from '../comparison/run-diff.mjs';

// A gate that follows moves: repositories are rearranged between base and head and the comparison
// must report only what the change adds. The probe analyzer reads the policy file the runner hands
// it, so each snapshot is analysed with the layout of its own config, like the real analyzers.

const repositories = [];

afterEach(() => {
  for (const root of repositories.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function probeAnalyzer() {
  return {
    name: 'probe',
    version: '1.0.0',
    configurationHash: 'probe',
    exclusions: [],
    createInvocation: ({ projectRoot }) => ({ command: process.execPath, args: [projectRoot] }),
  };
}

/** Finds `// FINDING <json>` lines under the source roots of the policy the snapshot runs with. */
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

const finding = (identity) => `// FINDING ${JSON.stringify({ identity })}\n`;
const filler = (name) =>
  Array.from(
    { length: 12 },
    (_, index) => `export const ${name}${String(index)} = ${String(index)};\n`,
  ).join('');

const HERMETIC_GIT_ENVIRONMENT = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

function git(root, ...arguments_) {
  return execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...arguments_],
    { cwd: root, encoding: 'utf8', env: HERMETIC_GIT_ENVIRONMENT },
  ).trim();
}

let templateRoot;

beforeAll(() => {
  templateRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-moves-template-')));
  git(templateRoot, 'init', '-q', '-b', 'main');
});

afterAll(() => {
  rmSync(templateRoot, { recursive: true, force: true });
});

function createRepository(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-moves-')));
  repositories.push(root);
  cpSync(path.join(templateRoot, '.git'), path.join(root, '.git'), { recursive: true });
  write(root, files);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  git(root, 'branch', 'base-ref');
  return root;
}

function write(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), contents);
  }
}

function move(root, from, to) {
  mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
  git(root, 'mv', from, to);
}

function commitHead(root) {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'head');
}

function compare(root, { projectRelativePath = '.', headPolicy, resolveBaseSetup } = {}) {
  return runQualityDiff({
    repositoryRoot: root,
    projectRelativePath,
    headProjectRoot: path.join(root, projectRelativePath),
    requestedBaseRef: 'base-ref',
    outputRoot: path.join(root, 'reports'),
    analyzers: [probeAnalyzer()],
    headPolicy,
    resolveBaseSetup,
    runTasks: runProbe,
  });
}

const identities = (findings) => findings.map((entry) => entry.identity);

describe('a folder move without edits', () => {
  it('reports no new findings', () => {
    const root = createRepository({
      'src/a.mjs': `${filler('a')}${finding('a-site')}`,
      'src/nested/b.mjs': `${filler('b')}${finding('b-site')}`,
    });
    move(root, 'src/a.mjs', 'lib/a.mjs');
    move(root, 'src/nested/b.mjs', 'lib/nested/b.mjs');
    commitHead(root);

    const report = compare(root, {
      headPolicy: { layout: { sourceRoots: ['lib'] } },
      resolveBaseSetup: () => ({ headPolicy: { layout: { sourceRoots: ['src'] } } }),
    });

    expect(identities(report.newFindings)).toEqual([]);
    expect(identities(report.resolvedFindings)).toEqual([]);
    expect(report.unchangedFindings).toHaveLength(2);
    expect(report.summary.renamedPaths).toBe(2);
  });

  it('keeps the old behaviour for a repository that did not move', () => {
    const root = createRepository({ 'src/a.mjs': `${filler('a')}${finding('a-site')}` });
    write(root, { 'src/c.mjs': `${filler('c')}${finding('c-site')}` });
    commitHead(root);

    const report = compare(root);

    expect(identities(report.newFindings)).toEqual(['c-site']);
    expect(report.summary.renamedPaths).toBe(0);
  });
});

describe('a folder move with a new violation', () => {
  it('reports exactly the new violation', () => {
    const root = createRepository({
      'src/a.mjs': `${filler('a')}${finding('a-site')}`,
      'src/b.mjs': `${filler('b')}${finding('b-site')}`,
    });
    move(root, 'src/a.mjs', 'lib/a.mjs');
    move(root, 'src/b.mjs', 'lib/b.mjs');
    write(root, { 'lib/fresh.mjs': `${filler('f')}${finding('fresh-site')}` });
    commitHead(root);

    const report = compare(root, {
      headPolicy: { layout: { sourceRoots: ['lib'] } },
      resolveBaseSetup: () => ({ headPolicy: { layout: { sourceRoots: ['src'] } } }),
    });

    expect(identities(report.newFindings)).toEqual(['fresh-site']);
    expect(report.newFindings[0].path).toBe('lib/fresh.mjs');
  });

  it('matches a moved file that was rewritten beyond git similarity because its folder moved', () => {
    const root = createRepository({
      'src/a.mjs': `${filler('a')}${finding('a-site')}`,
      'src/b.mjs': `${filler('b')}${finding('b-site')}`,
      'src/rewritten.mjs': `${filler('r')}${finding('r-site')}`,
    });
    move(root, 'src/a.mjs', 'lib/a.mjs');
    move(root, 'src/b.mjs', 'lib/b.mjs');
    git(root, 'rm', '-q', 'src/rewritten.mjs');
    write(root, {
      'lib/rewritten.mjs': `${filler('totally-different')}${filler('other')}${filler('more')}${finding('r-site')}`,
    });
    commitHead(root);

    const report = compare(root, {
      headPolicy: { layout: { sourceRoots: ['lib'] } },
      resolveBaseSetup: () => ({ headPolicy: { layout: { sourceRoots: ['src'] } } }),
    });

    expect(identities(report.newFindings)).toEqual([]);
    expect(report.unchangedFindings).toHaveLength(3);
  });
});

describe('a project whose root moved', () => {
  it('analyses the base where the package was and matches findings through the move', () => {
    const root = createRepository({
      'packages/app/package.json': '{"name":"app"}\n',
      'packages/app/src/a.mjs': `${filler('a')}${finding('a-site')}`,
      'packages/app/src/b.mjs': `${filler('b')}${finding('b-site')}`,
    });
    move(root, 'packages/app/package.json', 'package.json');
    move(root, 'packages/app/src/a.mjs', 'src/a.mjs');
    move(root, 'packages/app/src/b.mjs', 'src/b.mjs');
    write(root, { 'src/c.mjs': `${filler('c')}${finding('c-site')}` });
    commitHead(root);

    const report = compare(root);

    expect(identities(report.newFindings)).toEqual(['c-site']);
    expect(report.unchangedFindings).toHaveLength(2);
  });

  it('follows a package that moved into a subdirectory', () => {
    const root = createRepository({
      'package.json': '{"name":"app"}\n',
      'src/a.mjs': `${filler('a')}${finding('a-site')}`,
    });
    move(root, 'package.json', 'typescript/package.json');
    move(root, 'src/a.mjs', 'typescript/src/a.mjs');
    commitHead(root);

    const report = compare(root, { projectRelativePath: 'typescript' });

    expect(identities(report.newFindings)).toEqual([]);
    expect(report.unchangedFindings).toHaveLength(1);
  });
});

describe('a config that changed between base and head', () => {
  const baseFiles = {
    'nitpicker.config.json': '{"layout":{"sourceRoots":["legacy"]}}\n',
    'legacy/a.mjs': `${filler('a')}${finding('a-site')}`,
    'legacy/b.mjs': `${filler('b')}${finding('b-site')}`,
  };

  function moveToSrc(root) {
    git(root, 'rm', '-q', 'nitpicker.config.json');
    write(root, { 'nitpicker.config.json': '{"layout":{"sourceRoots":["src"]}}\n' });
    move(root, 'legacy/a.mjs', 'src/a.mjs');
    move(root, 'legacy/b.mjs', 'src/b.mjs');
    commitHead(root);
  }

  it('analyses the base with the base config', () => {
    const root = createRepository(baseFiles);
    moveToSrc(root);

    const report = compare(root, {
      headPolicy: { layout: { sourceRoots: ['src'] } },
      resolveBaseSetup: createBaseSetupResolver({
        headConfig: { layout: { sourceRoots: ['src'] } },
        injectedAnalyzers: [probeAnalyzer()],
      }),
    });

    expect(report.summary.overallStatus).toBe('completed');
    expect(identities(report.newFindings)).toEqual([]);
    expect(report.unchangedFindings).toHaveLength(2);
  });

  it('is what makes the difference: the head config alone sees nothing on the base', () => {
    const root = createRepository(baseFiles);
    moveToSrc(root);

    const report = compare(root, { headPolicy: { layout: { sourceRoots: ['src'] } } });

    expect(identities(report.newFindings)).toEqual(['a-site', 'b-site']);
  });

  it('falls back to the head config when the base has none or it does not load', () => {
    const warnings = [];
    const resolve = createBaseSetupResolver({
      headConfig: {},
      injectedAnalyzers: [probeAnalyzer()],
      warn: (message) => warnings.push(message),
    });
    const root = createRepository({ 'nitpicker.config.json': '{not json' });

    expect(resolve({ baseProjectRoot: root, analyzers: [probeAnalyzer()] })).toEqual({});
    expect(warnings).toEqual(expectedOutput333_22());
    expect(resolve({ baseProjectRoot: path.join(root, 'missing'), analyzers: [] })).toEqual({});
    expect(warnings).toHaveLength(1);
  });

  it('keeps the head analyzers for names the base config does not provide', () => {
    const root = createRepository({ 'nitpicker.config.json': '{"disable":["other"]}\n' });
    const headOnly = { ...probeAnalyzer(), name: 'head-only' };
    const resolve = createBaseSetupResolver({
      headConfig: {},
      injectedAnalyzers: [probeAnalyzer(), { ...probeAnalyzer(), name: 'other' }],
    });

    const setup = resolve({ baseProjectRoot: root, analyzers: [headOnly] });

    expect(setup.analyzers).toEqual([headOnly]);
    expect(setup.headPolicy.exclude).toEqual([]);
  });
});
