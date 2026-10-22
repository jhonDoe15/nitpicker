import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import {
  isBaseTestFailure,
  runOrNoteFailingTests,
  testsFailedFinding,
  withTestsFailures,
} from './tests-failed.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const SUITE = (name) =>
  `<testsuite name="shop.T"><testcase classname="shop.T" name="${name}"><failure message="no"/></testcase></testsuite>`;

function failingCall(root, modules) {
  const listed = modules.map((dir) => {
    const results = path.join(root, 'results', dir || 'root');
    mkdirSync(results, { recursive: true });
    writeFileSync(path.join(results, 'TEST-shop.T.xml'), SUITE(`in_${dir || 'root'}`));
    return { dir, results: [results] };
  });
  return [
    'mkdir -p "$report"',
    `printf '%s' '${JSON.stringify(listed)}' > "$report/test-results.json"`,
    `echo 'FAILURE: Build failed' >&2`,
    'exit 1',
  ].join('\n');
}

function fakeGradle(failingModules) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-fake-gradle-'));
  temporaryRoots.push(root);
  const log = path.join(root, 'calls.log');
  const script = path.join(root, 'gradle');
  const cases = failingModules
    .map((modules, index) => `${String(index + 1)})\n${failingCall(root, modules)}\n;;`)
    .join('\n');
  writeFileSync(
    script,
    `#!/bin/sh
echo "$@" >> '${log}'
for argument in "$@"; do
  case "$argument" in
    -Pnitpicker.reportDir=*) report="\${argument#-Pnitpicker.reportDir=}" ;;
  esac
done
case $(wc -l < '${log}' | tr -d ' ') in
${cases}
*) rm -rf '${root}/results'; echo 'Execution failed for task :compileJava' >&2; exit 1 ;;
esac
`,
  );
  chmodSync(script, 0o755);
  const calls = () =>
    readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const words = line.split(' ');
        return {
          continued: words.includes('--continue'),
          testsFailed: words.find((word) => word.startsWith('-Pnitpicker.testsFailed=')),
        };
      });
  return { root, script, calls };
}

describe('isBaseTestFailure', () => {
  it('is true only for named failing tests on the base snapshot', () => {
    const failure = Object.assign(new Error('red'), {
      failures: [{ module: '.', tests: ['shop.T.t: no'] }],
    });

    expect([
      isBaseTestFailure(failure, { snapshot: 'base' }),
      isBaseTestFailure(failure, { snapshot: 'head' }),
      isBaseTestFailure(failure, undefined),
      isBaseTestFailure(Object.assign(new Error('x'), { failures: [] }), { snapshot: 'base' }),
      isBaseTestFailure(new Error('x'), { snapshot: 'base' }),
    ]).toEqual([true, false, false, false, false]);
  });
});

describe('testsFailedFinding', () => {
  it('is a tool error of the preset that names the module and the failing tests', () => {
    expect(
      testsFailedFinding('kotlin', { module: 'core', tests: ['shop.T.a: no', 'shop.T.b: no'] }),
    ).toEqual({
      tool: 'kotlin',
      rule: 'tests-failed',
      path: '.',
      identity: 'tests-failed:core',
      message: 'Tests fail on the base in core:\n  shop.T.a: no\n  shop.T.b: no',
      classification: 'tool-error',
      symbol: 'core',
    });
  });

  it('words the root project without a module and cuts a long message', () => {
    const finding = testsFailedFinding('java', { module: '.', tests: ['x'.repeat(5000)] });

    expect([finding.identity, finding.symbol, finding.message.length]).toEqual([
      'tests-failed',
      '.',
      4003,
    ]);
    expect(finding.message.startsWith('Tests fail on the base:\n  xxx')).toBe(true);
  });
});

describe('collectJavaFindings on a failing Gradle build', () => {
  const collect = (fake, snapshot) =>
    collectJavaFindings(fake.root, {
      gradle: fake.script,
      policy: { preset: 'java', snapshot },
    });

  it('runs the failed base again without the tests of the failing modules, after letting every module run', () => {
    const fake = fakeGradle([['core', 'api']]);

    expect(() => collect(fake, 'base')).toThrow('Execution failed for task :compileJava');
    expect(fake.calls()).toEqual([
      { continued: true, testsFailed: undefined },
      { continued: true, testsFailed: '-Pnitpicker.testsFailed=core,api' },
    ]);
  });

  it('does not rerun a failed head: a red head fails', () => {
    const fake = fakeGradle([['']]);

    expect(() => collect(fake, 'head')).toThrow('Tests fail in');
    expect(fake.calls()).toEqual([{ continued: false, testsFailed: undefined }]);
  });

  it('does not rerun a base that failed without a failing test', () => {
    const fake = fakeGradle([]);

    expect(() => collect(fake, 'base')).toThrow('Execution failed for task :compileJava');
    expect(fake.calls()).toEqual([{ continued: true, testsFailed: undefined }]);
  });
});

describe('runOrNoteFailingTests', () => {
  const failureOf = (...modules) =>
    Object.assign(new Error('red'), {
      failures: modules.map((module) => ({ module, tests: [`${module}.T.t: no`] })),
    });

  function runner(...errors) {
    const calls = [];
    const run = (_root, options) => {
      calls.push(options.testsFailedModules);
      const error = errors[calls.length - 1];
      if (error !== undefined) {
        throw error;
      }
    };
    return { run, calls };
  }

  it('runs once and notes nothing when the build passes', () => {
    const { run, calls } = runner();

    expect([runOrNoteFailingTests(run, '/p', { policy: { snapshot: 'base' } }), calls]).toEqual([
      [],
      [[]],
    ]);
  });

  it('reruns a red base without the tests of the failing modules and returns their failures', () => {
    const { run, calls } = runner(failureOf('core', 'api'));

    expect([runOrNoteFailingTests(run, '/p', { policy: { snapshot: 'base' } }), calls]).toEqual([
      [
        { module: 'core', tests: ['core.T.t: no'] },
        { module: 'api', tests: ['api.T.t: no'] },
      ],
      [[], ['core', 'api']],
    ]);
  });

  it('fails when the rerun fails too', () => {
    const second = new Error('compile');
    const { run } = runner(failureOf('core'), second);

    expect(() => runOrNoteFailingTests(run, '/p', { policy: { snapshot: 'base' } })).toThrow(
      second,
    );
  });

  it('lets a red head fail', () => {
    const failure = failureOf('core');
    const { run, calls } = runner(failure);

    expect(() => runOrNoteFailingTests(run, '/p', { policy: { snapshot: 'head' } })).toThrow(
      failure,
    );
    expect(calls).toEqual([[]]);
  });
});

describe('withTestsFailures', () => {
  it('adds a tool error for each failing module, or nothing when none failed', () => {
    const findings = [{ rule: 'x' }];
    const failures = [
      { module: '.', tests: ['a: no'] },
      { module: 'core', tests: ['b: no'] },
    ];

    expect([
      withTestsFailures(findings, 'java', undefined),
      withTestsFailures(findings, 'java', failures).map(({ rule, symbol }) => `${rule} ${symbol}`),
    ]).toEqual([findings, ['x undefined', 'tests-failed .', 'tests-failed core']]);
  });
});
