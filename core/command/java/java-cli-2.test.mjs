import { expectedOutput378_46 } from '../../diff/fixtures/expected-output/core-java-cli.mjs';

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

describe('nitpicker with "preset": "kotlin"', () => {
  const kotlinConfig = (formatter) =>
    `${JSON.stringify({ preset: 'kotlin', ...(formatter && { kotlin: { formatter } }) })}\n`;
  const kotlinRepository = (files = {}) =>
    gradleRepository({
      'nitpicker.config.json': kotlinConfig(),
      'detekt.txt': 'Legacy magic number\n',
      ...files,
    });
  const branchReport = (...lines) =>
    `<report name="demo"><package name="demo"><sourcefile name="K.kt">${lines
      .map(
        ([nr, missed, covered]) =>
          `<line nr="${nr}" mi="0" ci="1" mb="${missed}" cb="${covered}"/>`,
      )
      .join('')}</sourcefile></package></report>`;
  const pitReport = (className, sourceFile) =>
    `<mutations><mutation detected='false' status='SURVIVED'><sourceFile>${sourceFile}</sourceFile><mutatedClass>${className}</mutatedClass><mutatedMethod>fee</mutatedMethod><methodDescription>(I)I</methodDescription><lineNumber>3</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.MathMutator</mutator><description>Replaced integer multiplication with division</description></mutation></mutations>`;
  const mutantsOf = (result) =>
    result.json('new-findings.json').filter(({ rule }) => rule.startsWith('mutant-'));
  const feeSource = 'package demo\n\nfun fee(weight: Int): Int = weight * 2\n';
  const surchargeSource = `${feeSource}\nfun surcharge(weight: Int): Int = if (weight > 10) 5 else 0\n\nval numbers = sequence {\n    yield(1)\n}\n`;
  const wideFunction = (name, parameters, start) => ({
    file: 'src/main/kotlin/demo/Wide.kt',
    name,
    start,
    end: start,
    lines: 1,
    statements: 1,
    maxControlNesting: 0,
    parameters,
    complexity: 1,
  });
  const wideSource = (...signatures) =>
    `package demo\n\n${signatures.map((signature) => `fun ${signature} = 0\n`).join('\n')}`;
  const metricsOf = (...functions) => `${JSON.stringify({ functions, files: [] })}\n`;
  const newEnforceable = (result, tool) =>
    result
      .json('new-findings.json')
      .filter((finding) => finding.tool === tool && finding.classification === 'enforceable');
  const FOUR_PARAMETERS = 'sum(a: Int, b: Int, c: Int, d: Int)';
  const legacyWide = () =>
    kotlinRepository({
      'src/main/kotlin/demo/Wide.kt': wideSource(FOUR_PARAMETERS),
      'kotlin-metrics.json': metricsOf(wideFunction('sum', 4, 3)),
    });
  const kotlinToolError = (snapshot) => [
    expect.objectContaining({
      tool: 'kotlin',
      snapshot,
      rule: 'gradle-failure',
      message: expect.stringContaining('compileKotlin failed'),
    }),
  ];
  it('passes when the change adds no finding and keeps the legacy detekt finding baselined', () => {
    const root = kotlinRepository();
    write(root, { 'src/main/java/demo/A.java': 'package demo;\n\n\n\npublic final class A {}\n' });
    commit(root, 'move only');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(0);
    expect(result.json('summary.json').tools.map(({ name }) => name)).toEqual(['kotlin']);
  });
  it('fails on a new detekt finding and reports it in text and SARIF', () => {
    const root = kotlinRepository();
    write(root, { 'detekt.txt': 'Legacy magic number\nAdded magic number\n' });
    commit(root, 'add a detekt finding');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(result.json('new-findings.json')).toEqual(expectedOutput378_46());
    expect(
      result
        .json('report.sarif')
        .runs.flatMap((sarifRun) => sarifRun.results.map(({ ruleId }) => ruleId)),
    ).toEqual(['detekt/detekt.style.MagicNumber']);
  });
  it('fails on a newly violated ktlint rule of a project that uses ktlint, naming rule and exception', () => {
    const root = kotlinRepository({ '.editorconfig': 'ktlint_code_style = ktlint_official\n' });
    write(root, { 'ktlint.txt': 'standard:no-wildcard-imports|Wildcard import\n' });
    commit(root, 'add a wildcard import');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'ktlint',
        rule: 'ktlint.standard:no-wildcard-imports',
        path: 'src/main/kotlin/demo/K.kt',
        identity: 'fp:nitpicker/subject=Wildcard import',
        location: { line: 3 },
        message:
          'Wildcard import. Lift this rule: ktlint_standard_no-wildcard-imports = disabled in .editorconfig. Not your formatter: set kotlin.formatter',
        classification: 'enforceable',
      },
    ]);
  });
  it('fails on a newly unformatted file with the configured ktfmt and names kotlin.formatter', () => {
    const root = kotlinRepository({ 'nitpicker.config.json': kotlinConfig('ktfmt') });
    write(root, { 'kotlin-format.txt': 'src/main/kotlin/demo/K.kt\n' });
    commit(root, 'misformat a file');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'ktfmt',
        rule: 'format',
        path: 'src/main/kotlin/demo/K.kt',
        identity: 'format',
        message: 'File is not formatted with ktfmt. Not your formatter: set kotlin.formatter',
        classification: 'enforceable',
      },
    ]);
  });
  it('fails on a changed Kotlin branch no test takes and ignores generated ones', () => {
    const root = kotlinRepository({
      'src/main/kotlin/demo/K.kt': feeSource,
      'jacoco.xml': branchReport(),
    });
    write(root, {
      'src/main/kotlin/demo/K.kt': surchargeSource,
      'jacoco.xml': branchReport([5, 1, 1], [7, 1, 1], [8, 1, 1]),
    });
    commit(root, 'add an untested branch');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'jacoco',
        rule: 'changed-branch-coverage',
        path: 'src/main/kotlin/demo/K.kt',
        identity: 'branch-source:2523a9a20c75ac9a',
        message: 'Branch coverage is 50.00%; minimum is 95%',
        classification: 'enforceable',
        location: { line: 5 },
      },
    ]);
  });
  it('keeps an uncovered Kotlin branch baselined while its line is unchanged', () => {
    const root = kotlinRepository({
      'src/main/kotlin/demo/K.kt': surchargeSource,
      'jacoco.xml': branchReport([5, 1, 1]),
    });
    write(root, { 'src/main/kotlin/demo/K.kt': `// moved\n${surchargeSource}` });
    write(root, { 'jacoco.xml': branchReport([6, 1, 1]) });
    commit(root, 'insert a line above it');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(0);
  });
  it('reports a surviving Kotlin mutant without failing', () => {
    const root = kotlinRepository({ 'src/main/kotlin/demo/K.kt': feeSource });
    write(root, { 'mutations.xml': pitReport('demo.KKt', 'K.kt') });
    commit(root, 'a mutant survives');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(0);
    expect(mutantsOf(result)).toEqual([
      {
        tool: 'pit',
        rule: 'mutant-survived',
        path: 'src/main/kotlin/demo/K.kt',
        identity: 'demo.KKt|fee(I)I|MathMutator|Replaced integer multiplication with division#1',
        message:
          'Survived MathMutator: Replaced integer multiplication with division: no test fails when this code changes. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        classification: 'descriptive',
        symbol: 'demo.KKt#fee(I)I',
        location: { line: 3 },
      },
    ]);
  });
  it('still fails a surviving mutant in a Java class of a Kotlin project', () => {
    const root = kotlinRepository();
    write(root, { 'mutations.xml': pitReport('demo.A', 'A.java') });
    commit(root, 'a Java mutant survives');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(mutantsOf(result)).toEqual([
      {
        tool: 'pit',
        rule: 'mutant-survived',
        path: 'src/main/java/demo/A.java',
        identity: 'demo.A|fee(I)I|MathMutator|Replaced integer multiplication with division#1',
        message:
          'Survived MathMutator: Replaced integer multiplication with division: no test fails when this code changes. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        classification: 'enforceable',
        symbol: 'demo.A#fee(I)I',
        location: { line: 3 },
      },
    ]);
  });
});
