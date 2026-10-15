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

import { KOTLIN_EXCEPTION_RULES } from '../../../languages/java/adapters/kotlin/kotlin-options.mjs';

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
  describe('exceptions for one-way rules', () => {
    const callRule = 'detekt.style.ForbiddenMethodCall';
    const forbidden =
      'The method `kotlinx.coroutines.runBlocking` has been forbidden: Make the caller `suspend` (`suspend fun main()` for an entry point) and use `coroutineScope { ... }` for concurrent work.';
    const withExceptions = (exceptions) => `${JSON.stringify({ preset: 'kotlin', exceptions })}\n`;
    const exception = {
      rule: callRule,
      paths: ['src/main/kotlin/demo/K.kt'],
      reason: 'The entry point blocks on its coroutine.',
    };
    const added = {
      'detekt.txt': `Legacy magic number\n${callRule} :: ${forbidden}\n`,
    };
    it('fails a new finding of a one-way rule and hands it the allowed form and the exception route', () => {
      const root = kotlinRepository();
      write(root, added);
      commit(root, 'add a forbidden call');

      const result = run(root);

      expect(result.exitCode, result.output.out + result.output.err).toBe(1);
      expect(result.json('new-findings.json')).toEqual([
        {
          tool: 'detekt',
          rule: callRule,
          path: 'src/main/kotlin/demo/K.kt',
          identity: `fp:nitpicker/subject=${forbidden}`,
          location: { line: 4 },
          message: `${forbidden} To allow it on specific paths, add an "exceptions" entry for rule ${callRule} in nitpicker.config.json.`,
          classification: 'enforceable',
        },
      ]);
    });
    it('passes the same change when nitpicker.config.json lists an exception for the path', () => {
      const root = kotlinRepository({ 'nitpicker.config.json': withExceptions([exception]) });
      write(root, added);
      commit(root, 'add a forbidden call');

      const result = run(root, [], { subprocess: true });

      expect(result.exitCode, result.output.out + result.output.err).toBe(0);
    });
    it('does not lift the rule for another path', () => {
      const other = { ...exception, paths: ['src/main/kotlin/other/**'] };
      const root = kotlinRepository({ 'nitpicker.config.json': withExceptions([other]) });
      write(root, added);
      commit(root, 'add a forbidden call');

      const result = run(root, [], { subprocess: true });

      expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    });
    it('rejects an exception for a rule that is not a one-way rule', () => {
      const root = kotlinRepository({
        'nitpicker.config.json': withExceptions([
          { ...exception, rule: 'detekt.style.MagicNumber' },
        ]),
      });

      const result = run(root);

      expect(result.exitCode).toBe(2);
      expect(result.output.err).toBe(
        `nitpicker failed: nitpicker.config.json: "exceptions[0].rule" is "detekt.style.MagicNumber", which is not a rule with exceptions. Rules with exceptions for the kotlin preset: ${KOTLIN_EXCEPTION_RULES.join(', ')}. Tune any other detekt rule in config/detekt/detekt.yml\n`,
      );
    });
  });
  it.each([undefined, 'none'])(
    'runs no format check for a project without a detected formatter (kotlin.formatter %s)',
    (formatter) => {
      const root = kotlinRepository({ 'nitpicker.config.json': kotlinConfig(formatter) });
      write(root, {
        'ktlint.txt': 'standard:no-wildcard-imports|Wildcard import\n',
        'kotlin-format.txt': 'src/main/kotlin/demo/K.kt\n',
      });
      commit(root, 'violate every formatter');

      const result = run(root);

      expect(result.exitCode, result.output.out + result.output.err).toBe(0);
    },
  );
  it('reports a raised legacy allowance under the kotlin analyzer', () => {
    const inventory = (count) =>
      `${JSON.stringify({
        sites: [
          {
            file: 'src/main/kotlin/demo/K.kt',
            rule: 'detekt.style.MagicNumber',
            source: 'fp:nitpicker/subject=Legacy magic number',
            count,
          },
        ],
      })}\n`;
    const root = kotlinRepository({ 'nitpicker.legacy.json': inventory(1) });
    write(root, { 'nitpicker.legacy.json': inventory(2) });
    commit(root, 'raise the allowance');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'kotlin',
        rule: 'baseline-expansion',
        path: 'src/main/kotlin/demo/K.kt',
        identity: 'site:fbe5622ec73235ebeafafa81',
        message: 'Legacy allowance increased from 1 to 2 for detekt.style.MagicNumber',
        classification: 'enforceable',
      },
    ]);
  });
  it('keeps a Kotlin function over the parameter limit baselined when it only moves', () => {
    const root = legacyWide();
    write(root, {
      'src/main/kotlin/demo/Wide.kt': `package demo\n\nval answer = 1\n\nfun ${FOUR_PARAMETERS} = 0\n`,
      'kotlin-metrics.json': metricsOf(wideFunction('sum', 4, 5)),
    });
    commit(root, 'move the function');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(0);
  });
  it('fails a Kotlin function that grows past the parameter limit it already exceeded', () => {
    const root = legacyWide();
    write(root, {
      'src/main/kotlin/demo/Wide.kt': wideSource('sum(a: Int, b: Int, c: Int, d: Int, e: Int)'),
      'kotlin-metrics.json': metricsOf(wideFunction('sum', 5, 3)),
    });
    commit(root, 'add a parameter');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(newEnforceable(result, 'structure')).toEqual([
      {
        tool: 'structure',
        rule: 'function-parameters-limit',
        path: 'src/main/kotlin/demo/Wide.kt',
        identity: 'function:sum:occurrence:1:source:88a9edab7be3d0a022e4137e',
        message:
          'sum grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another.',
        classification: 'enforceable',
        symbol: 'sum',
        location: { line: 3 },
        ratchet: {
          key: 'function:sum:occurrence:1:parameters',
          value: 5,
          worseMessage:
            'sum grew from {base} to 5 parameters (limit 3). Group related parameters into one object instead of adding another.',
          heldMessage:
            'sum: 5 parameters (limit 3), allowed because base was {base}; any increase fails.',
        },
      },
    ]);
  });
});
