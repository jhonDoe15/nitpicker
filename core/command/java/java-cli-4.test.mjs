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

import { analyzeJavaSnapshot } from '../../../languages/java/adapters/java-runner.mjs';

import { createJavaAnalyzer } from '../../../languages/java/adapters/java-analyzer.mjs';

import { JAVA_TOOLS } from '../../../languages/java/adapters/gradle-presets.mjs';

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
  it('fails a new Kotlin function over the parameter limit', () => {
    const root = legacyWide();
    write(root, {
      'src/main/kotlin/demo/Wide.kt': wideSource(
        FOUR_PARAMETERS,
        'product(a: Int, b: Int, c: Int, d: Int)',
      ),
      'kotlin-metrics.json': metricsOf(wideFunction('sum', 4, 3), wideFunction('product', 4, 5)),
    });
    commit(root, 'add a function');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(newEnforceable(result, 'structure')).toEqual([
      {
        tool: 'structure',
        rule: 'function-parameters-limit',
        path: 'src/main/kotlin/demo/Wide.kt',
        identity: 'function:product:occurrence:1:source:4028b70dcfd552e455558543',
        message: 'product has 4 parameters; limit is 3',
        classification: 'enforceable',
        symbol: 'product',
        location: { line: 5 },
        ratchet: {
          key: 'function:product:occurrence:1:parameters',
          value: 4,
          worseMessage:
            'product grew from {base} to 4 parameters (limit 3). Group related parameters into one object instead of adding another.',
          heldMessage:
            'product: 4 parameters (limit 3), allowed because base was {base}; any increase fails.',
        },
      },
    ]);
  });
  it('fails a new Kotlin clone found by jscpd', () => {
    const root = kotlinRepository();
    const clone = (name) =>
      `package demo\n\nclass ${name} {\n    fun total(a: Int, b: Int): Int {\n        var total = 0\n${Array.from(
        { length: 10 },
        (_, index) =>
          `        total += (a * ${index + 2}) + (b - ${index})\n        if (total > ${index * 10}) {\n            total -= ${index + 1}\n        }\n`,
      ).join('')}        return total\n    }\n}\n`;
    write(root, {
      'src/main/kotlin/demo/Left.kt': clone('Left'),
      'src/main/kotlin/demo/Right.kt': clone('Right'),
    });
    commit(root, 'copy a class');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(newEnforceable(result, 'duplicates')).toEqual([
      {
        tool: 'duplicates',
        rule: 'duplicate-clone',
        path: 'src/main/kotlin/demo/Left.kt',
        identity:
          'pair:src/main/kotlin/demo/Left.kt|src/main/kotlin/demo/Right.kt:fragment:36d1c9baac959e2d7350e29b:occurrence:1',
        message:
          'This code repeats src/main/kotlin/demo/Right.kt:3 (46 lines). Keep one copy and call it from both places.',
        classification: 'enforceable',
        location: { line: 3 },
      },
    ]);
  });
  it('reports a Gradle failure on head as a kotlin tool error', () => {
    const root = kotlinRepository();
    write(root, { GRADLE_FAIL: 'compileKotlin failed\n' });
    commit(root, 'break the build');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json')).toEqual(kotlinToolError('head'));
  });
  it('reports a Gradle failure on base as a kotlin tool error', () => {
    const root = kotlinRepository({ GRADLE_FAIL: 'compileKotlin failed\n' });
    git(root, ['rm', '-q', 'GRADLE_FAIL']);
    commit(root, 'fix the build');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json')).toEqual(kotlinToolError('base'));
  });
});
describe('Kotlin analyzer', () => {
  it('is named kotlin, declares the Kotlin tools and starts the runner with the kotlin preset', () => {
    const analyzer = createJavaAnalyzer({ kotlin: true });
    const invocation = analyzer.createInvocation({ projectRoot: '/project', toolRoot: '/tool' });

    expect(analyzer.name).toBe('kotlin');
    expect(analyzer.reportedTools).toEqual([...JAVA_TOOLS, 'detekt', 'ktlint', 'ktfmt']);
    expect(invocation.args.slice(-2)).toEqual(['--preset', 'kotlin']);
    expect(createJavaAnalyzer().name).toBe('java');
    expect(createJavaAnalyzer().reportedTools).not.toContain('detekt');
  });
  it('maps a failing Gradle run to one tool-error finding of the kotlin analyzer', () => {
    const root = temporaryRoot('nitpicker-kotlin-unit-');
    write(root, { GRADLE_FAIL: 'detekt crashed\n' });

    const { findings } = analyzeJavaSnapshot(root, {
      gradle: fakeGradle,
      policy: { preset: 'kotlin' },
    });

    expect(findings).toEqual([
      {
        tool: 'kotlin',
        rule: 'gradle-failure',
        path: '.',
        identity: 'gradle-failure',
        message: `Java preset failed in ${root}: detekt crashed`,
        classification: 'tool-error',
      },
    ]);
  });
});
describe('a root project without Nitpicker reports', () => {
  it.each([
    ['kotlin', 'org.jetbrains.kotlin.jvm'],
    ['java', 'java'],
  ])('is a tool error naming the plugin for the %s preset', (preset, plugin) => {
    const root = temporaryRoot('nitpicker-no-reports-');
    write(root, { NO_REPORTS: '' });

    const { findings } = analyzeJavaSnapshot(root, { gradle: fakeGradle, policy: { preset } });

    expect(findings).toEqual([
      {
        tool: preset,
        rule: 'gradle-failure',
        path: '.',
        identity: 'gradle-failure',
        message: `The ${preset} preset found no Gradle reports in build/nitpicker: the root project must apply the ${plugin} plugin. Reports of submodules are not read`,
        classification: 'tool-error',
      },
    ]);
  });
});
describe('Java analyzer', () => {
  it('records the pinned tool versions and a stable configuration hash', () => {
    const analyzer = createJavaAnalyzer();

    expect(analyzer.version).toMatch(
      new RegExp(
        [
          '^pmd@[\\d.]+;spotbugs@[\\d.]+;googleJavaFormat@[\\d.]+;jac',
          'oco@[\\d.]+;checkstyle@[\\d.]+;lizard@[\\d.]+;pitest@[\\d.]',
          '+;pitestJunit5@[\\d.]+;detekt@[\\d.]+;detektKotlin@[\\d.]+',
          ';ktlint@[\\d.]+;ktfmt@[\\d.]+;kotlinCompiler@[\\d.]+;jscpd',
          '@[\\d.]+$',
        ].join(''),
        '',
      ),
    );
    expect(createJavaAnalyzer().configurationHash).toBe(analyzer.configurationHash);
  });
  it('maps a failing Gradle run to one tool-error finding', () => {
    const root = temporaryRoot('nitpicker-java-unit-');
    write(root, { GRADLE_FAIL: 'tool crashed\n' });

    const { findings } = analyzeJavaSnapshot(root, { gradle: fakeGradle });

    expect(findings).toEqual([
      {
        tool: 'java',
        rule: 'gradle-failure',
        path: '.',
        identity: 'gradle-failure',
        message: `Java preset failed in ${root}: tool crashed`,
        classification: 'tool-error',
      },
    ]);
  });
});
