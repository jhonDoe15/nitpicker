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
    expect(warnings).toEqual([
      "The base's nitpicker.config.json cannot be applied (nitpicker.config.json is not valid JSON: Expected property name or '}' in JSON at position 1 (line 1 column 2)); the base is analysed with the head config.",
    ]);
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

describe('a tool that produced no report on one side', () => {
  const notRun = `// FINDING ${JSON.stringify({
    identity: 'not-run',
    rule: 'not-run',
    classification: 'descriptive',
    toolNotRun: true,
  })}\n`;

  it('fails the run as a tool error when only the head lacks the report', () => {
    const root = createRepository({ 'src/a.mjs': `${filler('a')}${finding('a-site')}` });
    write(root, { 'src/a.mjs': `${filler('a')}${notRun}` });
    commitHead(root);

    const report = compare(root);

    expect(report.summary.overallStatus).toBe('tool-error');
    expect(report.toolErrors).toEqual([
      {
        tool: 'probe',
        snapshot: 'head',
        rule: 'not-run',
        path: 'src/a.mjs',
        message: 'probe finding The base produced this probe report, so the change broke it.',
      },
    ]);
    expect(report.newFindings).toEqual([]);
  });

  it('reports the head findings without failing when only the base lacks the report', () => {
    const root = createRepository({ 'src/a.mjs': `${filler('a')}${notRun}` });
    write(root, { 'src/a.mjs': `${filler('a')}${finding('a-site')}` });
    commitHead(root);

    const report = compare(root);

    expect(report.toolErrors).toEqual([]);
    expect(report.newFindings).toEqual([
      {
        tool: 'probe',
        rule: 'probe-rule',
        path: 'src/a.mjs',
        identity: 'a-site',
        classification: 'descriptive',
        location: { line: 13, column: 1 },
        message:
          'probe finding Not enforced: no base probe report shows whether the change added it.',
      },
    ]);
  });

  const legacyNotRun = `// FINDING ${JSON.stringify({
    identity: 'not-run:legacy',
    rule: 'not-run',
    classification: 'descriptive',
    toolNotRun: true,
    notRunScope: ['src/legacy'],
  })}\n`;

  function classified(report) {
    return report.newFindings.map(
      ({ identity, classification }) => `${identity} ${classification}`,
    );
  }

  it('relaxes only the moved file when one file of a not-run folder moves into another', () => {
    const root = createRepository({
      'src/legacy/a.mjs': filler('a'),
      'src/legacy/b.mjs': filler('b'),
      'src/kernel/k.mjs': filler('k'),
      'src/notice.mjs': `${filler('n')}${legacyNotRun}`,
    });
    move(root, 'src/legacy/a.mjs', 'src/kernel/a.mjs');
    write(root, {
      'src/kernel/a.mjs': `${filler('a')}${finding('moved-site')}`,
      'src/kernel/k.mjs': `${filler('k')}${finding('kernel-site')}`,
    });
    commitHead(root);

    expect(classified(compare(root))).toEqual([
      'moved-site descriptive',
      'kernel-site enforceable',
    ]);
  });

  it('carries the scope to the new folder when the whole not-run folder moves', () => {
    const root = createRepository({
      'src/legacy/a.mjs': filler('a'),
      'src/legacy/b.mjs': filler('b'),
      'src/kernel/k.mjs': filler('k'),
      'src/notice.mjs': `${filler('n')}${legacyNotRun}`,
    });
    move(root, 'src/legacy/a.mjs', 'src/kernel/a.mjs');
    move(root, 'src/legacy/b.mjs', 'src/kernel/b.mjs');
    write(root, {
      'src/kernel/k.mjs': `${filler('k')}${finding('kernel-site')}`,
      'src/legacy/fresh.mjs': `${filler('f')}${finding('fresh-site')}`,
      'src/notice.mjs': filler('n'),
    });
    commitHead(root);

    expect(classified(compare(root))).toEqual([
      'kernel-site descriptive',
      'fresh-site enforceable',
    ]);
  });
});
