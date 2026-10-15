import {
  expectedOutput150_8,
  expectedOutput153_31,
  expectedOutput154_46,
  expectedOutput162_77,
  expectedOutput165_81,
  expectedOutput208_10,
  expectedOutput211_48,
  expectedOutput226_10,
  expectedOutput229_48,
  expectedOutput260_48,
  expectedOutput283_8,
  expectedOutput289_20,
  expectedOutput311_45,
  expectedOutput328_48,
  expectedOutput345_22,
} from '../../diff/fixtures/expected-output/core-java-cli.mjs';

import { execFileSync } from 'node:child_process';

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';

import { tmpdir } from 'node:os';

import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runCli as runCliWithSubprocesses } from '../../cli.mjs';

import { runTasksInProcess } from '../../diff/fixtures/in-process-analyzers.mjs';

// The Java and Kotlin presets through the CLI with a fake `gradle`, so they run without Java. The
// real Gradle runs are covered by languages/java/adapters/java-preset.e2e.test.mjs
// (NITPICKER_JAVA_E2E=1) and kotlin-preset.e2e.test.mjs (NITPICKER_KOTLIN_E2E=1).

const fakeGradle = path.resolve(
  new URL('../../', import.meta.url).pathname,
  '../languages/java/adapters/fixtures/fake-gradle.mjs',
);

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

// Hermetic git: ignores the global config (commit signing adds a round trip to every commit).
const gitEnvironment = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: gitEnvironment });
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

// One repository with the default Gradle project, built once per file; each test copies it.
let templateRoot;

beforeAll(() => {
  templateRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-template-')));
  git(templateRoot, ['init', '-q', '--initial-branch=main']);
  git(templateRoot, ['config', 'user.name', 'Nitpicker Java Fixture']);
  git(templateRoot, ['config', 'user.email', 'nitpicker-java@example.invalid']);
  write(templateRoot, {
    'nitpicker.config.json': '{ "preset": "java" }\n',
    'build.gradle': "plugins { id 'java' }\n",
    'src/main/java/demo/A.java': 'package demo;\n\npublic final class A {}\n',
    'violations.txt': 'Avoid unused field: legacy\n',
  });
  commit(templateRoot, 'base');
  git(templateRoot, ['branch', 'comparison-base']);
});

afterAll(() => {
  rmSync(templateRoot, { recursive: true, force: true });
});

// Extra files become part of the base commit, so a test can start from a different base.
function gradleRepository(files = {}) {
  const root = temporaryRoot('nitpicker-java-cli-');
  cpSync(templateRoot, root, { recursive: true });
  if (Object.keys(files).length > 0) {
    write(root, files);
    commit(root, 'base');
    git(root, ['branch', '-f', 'comparison-base']);
  }
  return root;
}

// The Java runner runs in-process (it still spawns the fake gradle); the test that passes
// `{ subprocess: true }` keeps the real analyzer-scheduler and java-runner.mjs processes.
const runCli = (options) => runCliWithSubprocesses({ runTasks: runTasksInProcess, ...options });

function run(root, extra = [], { subprocess = false } = {}) {
  const output = { out: '', err: '' };
  const reports = path.join(temporaryRoot('nitpicker-java-out-'), 'reports');
  const exitCode = runCli({
    arguments_: ['--base', 'comparison-base', '--output', reports, ...extra],
    environment: { NO_COLOR: '1' },
    currentProjectRoot: root,
    stdout: { write: (value) => (output.out += value) },
    stderr: { write: (value) => (output.err += value) },
    progress: { write: () => undefined },
    ...(subprocess ? { runTasks: undefined } : {}),
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

    const result = run(root, [], { subprocess: true });

    expect({
      exitCode: result.exitCode,
      output: result.output.out + result.output.err,
    }).toEqual(expectedOutput150_8());
    expect(result.output.out).toEqual(expectedOutput153_31());
    expect(result.json('new-findings.json')).toEqual(expectedOutput154_46());
    expect(readFileSync(path.join(result.reports, 'report.sarif'), 'utf8')).toEqual(
      expectedOutput162_77(),
    );
    expect(readFileSync(path.join(result.reports, 'report.junit.xml'), 'utf8')).toEqual(
      expectedOutput165_81(),
    );
  });
  it('honours exclude from nitpicker.config.json', () => {
    const root = gradleRepository();
    write(root, {
      'nitpicker.config.json': '{ "preset": "java", "exclude": ["src/main/java/demo/**"] }\n',
      'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n',
    });
    commit(root, 'add violation in an excluded path');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(0);
    expect(result.json('new-findings.json')).toEqual([]);
  });
  describe('legacy inventory', () => {
    const site = (name, count) => ({
      file: 'src/main/java/demo/A.java',
      rule: 'UnusedPrivateField',
      source: `fp:nitpicker/subject=Avoid unused field: ${name}`,
      count,
    });
    const inventory = (...sites) => `${JSON.stringify({ sites })}\n`;
    it('baselines a site the inventory allows and still fails an unlisted one', () => {
      const root = gradleRepository({ 'nitpicker.legacy.json': inventory(site('added', 1)) });
      write(root, { 'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n' });
      commit(root, 'add a baselined violation');
      expect(run(root).exitCode).toBe(0);

      write(root, {
        'violations.txt':
          'Avoid unused field: legacy\nAvoid unused field: added\nAvoid unused field: other\n',
      });
      commit(root, 'add an unlisted violation');
      const result = run(root);
      expect({
        exitCode: result.exitCode,
        output: result.output.out + result.output.err,
      }).toEqual(expectedOutput208_10());
      expect(result.json('new-findings.json')).toEqual(expectedOutput211_48());
    });
    it('fails with baseline-expansion when head raises an allowance over base', () => {
      const root = gradleRepository({ 'nitpicker.legacy.json': inventory(site('legacy', 1)) });
      write(root, { 'nitpicker.legacy.json': inventory(site('legacy', 2)) });
      commit(root, 'raise the allowance');

      const result = run(root);

      expect({
        exitCode: result.exitCode,
        output: result.output.out + result.output.err,
      }).toEqual(expectedOutput226_10());
      expect(result.json('new-findings.json')).toEqual(expectedOutput229_48());
    });
    it('honours a custom inventory path from "legacyInventory"', () => {
      const root = gradleRepository({
        'nitpicker.config.json': '{ "preset": "java", "legacyInventory": "config/legacy.json" }\n',
        'config/legacy.json': inventory(site('added', 1)),
      });
      write(root, { 'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n' });
      commit(root, 'add a baselined violation');

      expect(run(root).exitCode).toBe(0);
    });
    it('treats a new inventory entry on head as an expansion', () => {
      const root = gradleRepository();
      write(root, {
        'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n',
        'nitpicker.legacy.json': inventory(site('added', 1)),
      });
      commit(root, 'baseline a new violation by editing the inventory');

      const result = run(root);

      expect(result.exitCode).toBe(1);
      expect(result.json('new-findings.json')).toEqual(expectedOutput260_48());
    });
  });
  it('fails a newly added clone', () => {
    const body = Array.from(
      { length: 12 },
      (_, i) =>
        `    int v${i} = compute(a, b) + ${i} * helper(a);\n    if (v${i} > 10) { total += v${i}; }`,
    ).join('\n');
    const source = (name) =>
      `package demo;\n\npublic final class ${name} {\n  int run(int a, int b) {\n    int total = 0;\n${body}\n    return total;\n  }\n}\n`;
    const root = gradleRepository({ 'src/main/java/demo/First.java': source('First') });
    write(root, { 'src/main/java/demo/Second.java': source('Second') });
    commit(root, 'copy the class');

    const result = run(root);

    expect({
      exitCode: result.exitCode,
      output: result.output.out + result.output.err,
    }).toEqual(expectedOutput283_8());
    const clones = result
      .json('new-findings.json')
      .filter((finding) => finding.rule === 'duplicate-clone');
    expect(clones).toEqual(expectedOutput289_20());
  });
  it('reports a Gradle failure on head as a tool error with exit 2 instead of throwing', () => {
    const root = gradleRepository();
    write(root, { GRADLE_FAIL: 'Execution failed for task :compileJava\n' });
    // The change also deletes a file, so the changed-lines reader sees a deleted path.
    git(root, ['rm', '-q', 'violations.txt']);
    commit(root, 'break the build');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.output.err).toBe('');
    expect(result.json('summary.json').overallStatus).toBe('tool-error');
    expect(result.json('tool-errors.json')).toEqual(expectedOutput311_45());
  });
  it('reports a missing gradle binary as a tool error', () => {
    process.env.NITPICKER_GRADLE = path.join(temporaryRoot('nitpicker-java-none-'), 'no-gradle');
    const root = gradleRepository();

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json')[0]).toEqual(expectedOutput328_48());
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
    expect(out.text).toEqual(expectedOutput345_22());
  });
});
