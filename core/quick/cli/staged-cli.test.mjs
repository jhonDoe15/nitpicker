import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import {
  finding,
  findingLine,
  policy,
} from '../../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { fixtureGit } from '../../diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { fakeAnalyzer, useCliFixtures } from '../../command/test-support/cli-harness.mjs';

const { createRepository, makeOutputRoot, makeTemporaryRoot, runCli } =
  useCliFixtures(nitpickerCli);

const CLEAN = 'export const clean = true;\n';

const UNREADABLE_INDEX = new RegExp(
  [
    '^nitpicker failed: Cannot read the staged changes: git write-tree failed in .+\\. ',
    'Resolve the conflicts and stage the files, or run nitpicker without --staged\\.\\n$',
  ].join(''),
  'su',
);

function dirty(identity) {
  return findingLine(finding({ identity }));
}

function repository() {
  return createRepository({
    'quality-policy.json': policy(),
    'src/main/clean.ts': CLEAN,
    'src/main/other.ts': CLEAN,
  });
}

function stage(root, files) {
  writeFiles(root, files);
  fixtureGit(root, ['add', '--', ...Object.keys(files)]);
}

function findingLines(outputRoot, file) {
  return JSON.parse(readFileSync(path.join(outputRoot, file), 'utf8')).map(
    ({ path: findingPath, location }) => `${findingPath}:${String(location.line)}`,
  );
}

function run(project, flags, environment = {}) {
  const output = captureOutput();
  const outputRoot = makeOutputRoot();
  const exitCode = runCli({
    arguments_: ['--base', project.baseRef, '--output', outputRoot, ...flags],
    environment: { NO_COLOR: '1', ...environment },
    currentProjectRoot: project.root,
    analyzers: [fakeAnalyzer()],
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return { exitCode, output, outputRoot };
}

describe('nitpicker --staged', () => {
  const originalIndexFile = process.env.GIT_INDEX_FILE;

  afterEach(() => {
    if (originalIndexFile === undefined) {
      delete process.env.GIT_INDEX_FILE;
    } else {
      process.env.GIT_INDEX_FILE = originalIndexFile;
    }
  });

  it('judges the staged content and ignores unstaged and untracked changes', () => {
    const project = repository();
    stage(project.root, { 'src/main/staged.ts': dirty('staged-finding') });
    writeFiles(project.root, {
      'src/main/other.ts': dirty('unstaged-finding'),
      'src/main/untracked.ts': dirty('untracked-finding'),
    });

    const { exitCode, outputRoot } = run(project, ['--staged']);

    expect(exitCode).toBe(1);
    expect(findingLines(outputRoot, 'new-findings.json')).toEqual(['src/main/staged.ts:1']);
  });

  it('records the staged run in summary.json and under the base line of the console', () => {
    const project = repository();
    stage(project.root, { 'src/main/staged.ts': CLEAN });

    const { exitCode, output, outputRoot } = run(project, ['--staged']);

    expect(exitCode).toBe(0);
    const summary = JSON.parse(readFileSync(path.join(outputRoot, 'summary.json'), 'utf8'));
    expect([summary.mode, summary.staged]).toEqual(['full', true]);
    expect(output.stdoutText.split('\n').slice(0, 2)).toEqual([
      'Base: comparison-base (argument)',
      'Staged run: the head is the index. Unstaged edits and untracked files are not judged.',
    ]);
    expect(output.stderrText).toBe('');
  });

  it('says when a config file in the working tree differs from the index', () => {
    const project = repository();
    stage(project.root, { 'src/main/staged.ts': CLEAN });
    writeFiles(project.root, {
      'package.json': '{ "name": "changed" }\n',
      'tsconfig.json': '{}\n',
      'src/main/other.ts': dirty('unstaged-finding'),
    });

    const { output } = run(project, ['--staged']);

    expect(output.stderrText).toBe(
      [
        'nitpicker: --staged judges the index but reads the config from the working tree,',
        ' and these files differ from the index: package.json, tsconfig.json.',
        ' Stage them, or run nitpicker without --staged.\n',
      ].join(''),
    );
  });

  it('passes when only unstaged and untracked changes are dirty', () => {
    const project = repository();
    writeFiles(project.root, {
      'src/main/other.ts': dirty('unstaged-finding'),
      'src/main/untracked.ts': dirty('untracked-finding'),
    });

    expect(run(project, ['--staged']).exitCode).toBe(0);
    expect(run(project, []).exitCode).toBe(1);
  });

  it('still fails on staged content that the working tree has since fixed', () => {
    const project = repository();
    stage(project.root, { 'src/main/staged.ts': dirty('staged-finding') });
    writeFiles(project.root, { 'src/main/staged.ts': CLEAN });

    expect(run(project, ['--staged']).exitCode).toBe(1);
    expect(run(project, []).exitCode).toBe(0);
  });

  it('judges the index a hook names in GIT_INDEX_FILE and leaves that variable out of later git calls', () => {
    const project = repository();
    writeFiles(project.root, { 'src/main/staged.ts': dirty('staged-finding') });
    const indexFile = path.join(makeTemporaryRoot('nitpicker-staged-index-'), 'index');
    process.env.GIT_INDEX_FILE = indexFile;
    fixtureGit(project.root, ['read-tree', 'HEAD']);
    fixtureGit(project.root, ['add', '--', 'src/main/staged.ts']);

    const { exitCode } = run(project, ['--staged'], { GIT_INDEX_FILE: indexFile });

    expect(exitCode).toBe(1);
    expect(process.env.GIT_INDEX_FILE).toBeUndefined();
  });

  it('keeps a hook index out of its git calls without --staged and judges the working tree', () => {
    const project = repository();
    writeFiles(project.root, { 'src/main/unstaged.ts': dirty('unstaged-finding') });
    const indexFile = path.join(makeTemporaryRoot('nitpicker-hook-index-'), 'index');
    process.env.GIT_INDEX_FILE = indexFile;

    const { exitCode, outputRoot } = run(project, [], { GIT_INDEX_FILE: indexFile });

    expect(exitCode).toBe(1);
    expect(findingLines(outputRoot, 'new-findings.json')).toEqual(['src/main/unstaged.ts:1']);
    expect(process.env.GIT_INDEX_FILE).toBeUndefined();
  });

  it('compares the index with HEAD when the clone has no remote base', () => {
    const project = repository();
    stage(project.root, { 'src/main/staged.ts': dirty('staged-finding') });
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--staged', '--output', makeOutputRoot()],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: project.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText.split('\n')[0]).toBe('Base: HEAD (staged, no remote base)');
  });

  it('says how to recover when the index cannot be read', () => {
    const project = repository();
    const indexFile = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-bad-index-')), 'index');
    writeFileSync(indexFile, 'not an index');

    const { exitCode, output } = run(project, ['--staged'], { GIT_INDEX_FILE: indexFile });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toMatch(UNREADABLE_INDEX);
  });

  it('judges the whole index for --all', () => {
    const project = repository();
    stage(project.root, { 'src/main/staged.ts': dirty('staged-finding') });
    writeFiles(project.root, { 'src/main/other.ts': dirty('unstaged-finding') });
    const output = captureOutput();
    const outputRoot = makeOutputRoot();

    const exitCode = runCli({
      arguments_: ['--all', '--staged', '--output', outputRoot],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: project.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(1);
    expect(findingLines(outputRoot, 'findings.json')).toEqual(['src/main/staged.ts:1']);
  });

  it('refuses --fix', () => {
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--staged', '--fix'],
      environment: {},
      currentProjectRoot: repository().root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toBe(
      'nitpicker failed: --staged cannot be combined with --fix: the fixes land in the working tree, not in the index. Run nitpicker --fix first, stage the changes, then run nitpicker --staged.\n',
    );
  });
});
