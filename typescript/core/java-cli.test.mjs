import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeJavaSnapshot } from '../adapters/java/java-runner.mjs';
import { createJavaAnalyzer } from '../adapters/java/java-analyzer.mjs';
import { runCli } from './cli.mjs';

// The Java preset through the CLI with a fake `gradle`, so it runs without Java. The real Gradle
// run is covered by adapters/java/java-preset.e2e.test.mjs (NITPICKER_JAVA_E2E=1).

const fakeGradle = path.resolve(import.meta.dirname, '../adapters/java/fixtures/fake-gradle.mjs');
const temporaryRoots = [];
let previousGradle;

beforeEach(() => {
  previousGradle = process.env.NITPICKER_GRADLE;
  process.env.NITPICKER_GRADLE = fakeGradle;
});

afterEach(() => {
  if (previousGradle === undefined) {
    delete process.env.NITPICKER_GRADLE;
  } else {
    process.env.NITPICKER_GRADLE = previousGradle;
  }
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot(prefix) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  temporaryRoots.push(root);
  return root;
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function write(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
}

function commit(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
}

function gradleRepository(files = {}) {
  const root = temporaryRoot('nitpicker-java-cli-');
  git(root, ['init', '-q', '--initial-branch=main']);
  git(root, ['config', 'user.name', 'Nitpicker Java Fixture']);
  git(root, ['config', 'user.email', 'nitpicker-java@example.invalid']);
  write(root, {
    'nitpicker.config.json': '{ "preset": "java" }\n',
    'build.gradle': "plugins { id 'java' }\n",
    'src/main/java/demo/A.java': 'package demo;\n\npublic final class A {}\n',
    'violations.txt': 'Avoid unused field: legacy\n',
    ...files,
  });
  commit(root, 'base');
  git(root, ['branch', 'comparison-base']);
  return root;
}

function run(root, extra = []) {
  const output = { out: '', err: '' };
  const reports = path.join(temporaryRoot('nitpicker-java-out-'), 'reports');
  const exitCode = runCli({
    arguments_: ['--base', 'comparison-base', '--output', reports, ...extra],
    environment: { NO_COLOR: '1' },
    currentProjectRoot: root,
    stdout: { write: (value) => (output.out += value) },
    stderr: { write: (value) => (output.err += value) },
  });
  const json = (name) => JSON.parse(readFileSync(path.join(reports, name), 'utf8'));
  return { exitCode, reports, json, output };
}

describe('nitpicker with "preset": "java"', () => {
  it('passes when the change adds no finding and keeps the legacy one baselined', () => {
    const root = gradleRepository();
    write(root, { 'src/main/java/demo/A.java': 'package demo;\n\n\n\npublic final class A {}\n' });
    commit(root, 'move only');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(0);
    expect(result.json('summary.json').tools.map(({ name }) => name)).toEqual(['java']);
  });

  it('fails on a new enforceable finding and reports it in text, JSON, SARIF and JUnit', () => {
    const root = gradleRepository();
    write(root, { 'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n' });
    commit(root, 'add violation');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(result.output.out).toContain('A.java');
    expect(result.json('new-findings.json')).toEqual([
      expect.objectContaining({
        tool: 'pmd',
        rule: 'UnusedPrivateField',
        path: 'src/main/java/demo/A.java',
        classification: 'enforceable',
      }),
    ]);
    expect(readFileSync(path.join(result.reports, 'report.sarif'), 'utf8')).toContain(
      'UnusedPrivateField',
    );
    expect(readFileSync(path.join(result.reports, 'report.junit.xml'), 'utf8')).toContain(
      'UnusedPrivateField',
    );
  });

  it('reports a Gradle failure on head as a tool error with exit 2 instead of throwing', () => {
    const root = gradleRepository();
    write(root, { GRADLE_FAIL: 'Execution failed for task :compileJava\n' });
    commit(root, 'break the build');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.output.err).toBe('');
    expect(result.json('summary.json').overallStatus).toBe('tool-error');
    expect(result.json('tool-errors.json')).toEqual([
      expect.objectContaining({
        tool: 'java',
        snapshot: 'head',
        rule: 'gradle-failure',
        message: expect.stringContaining('Execution failed for task :compileJava'),
      }),
    ]);
  });

  it('reports a Gradle failure on the base snapshot as a tool error', () => {
    const root = gradleRepository({ GRADLE_FAIL: 'base does not compile\n' });
    git(root, ['rm', '-q', 'GRADLE_FAIL']);
    commit(root, 'fix the build');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json')).toEqual([
      expect.objectContaining({ tool: 'java', snapshot: 'base', rule: 'gradle-failure' }),
    ]);
  });

  it('reports a missing gradle binary as a tool error', () => {
    process.env.NITPICKER_GRADLE = path.join(temporaryRoot('nitpicker-java-none-'), 'no-gradle');
    const root = gradleRepository();

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json')[0]).toMatchObject({ rule: 'gradle-failure' });
  });

  it('gates a snapshot with --all', () => {
    const root = gradleRepository();
    const reports = path.join(temporaryRoot('nitpicker-java-snapshot-'), 'reports');
    const out = { text: '' };

    const exitCode = runCli({
      arguments_: ['--all', '--output', reports],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: root,
      stdout: { write: (value) => (out.text += value) },
      stderr: { write: () => undefined },
    });

    expect(exitCode).toBe(1);
    expect(out.text).toContain('A.java');
  });
});

describe('Java analyzer', () => {
  it('records the pinned tool versions and a stable configuration hash', () => {
    const analyzer = createJavaAnalyzer();

    expect(analyzer.version).toMatch(
      /^pmd@[\d.]+;spotbugs@[\d.]+;googleJavaFormat@[\d.]+;jacoco@[\d.]+$/,
    );
    expect(createJavaAnalyzer().configurationHash).toBe(analyzer.configurationHash);
  });

  it('maps a failing Gradle run to one tool-error finding', () => {
    const root = temporaryRoot('nitpicker-java-unit-');
    write(root, { GRADLE_FAIL: 'tool crashed\n' });

    const { findings } = analyzeJavaSnapshot(root, { gradle: fakeGradle });

    expect(findings).toEqual([
      expect.objectContaining({
        tool: 'java',
        rule: 'gradle-failure',
        classification: 'tool-error',
        message: expect.stringContaining('tool crashed'),
      }),
    ]);
  });
});
