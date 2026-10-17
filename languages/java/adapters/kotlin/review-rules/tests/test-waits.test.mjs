import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { productionTypeResolver } from '../production-types.mjs';
import {
  argument,
  file,
  fn,
  klass,
  routeOf,
  run,
  summary,
  testFile,
  testMethod,
  wait,
} from '../test-support/facts.mjs';
import { FIXED_SLEEP_RULE } from '../../../../messages/wait-advice.mjs';
import { NEGATIVE_WAIT_RULE, testWaitFindings, waitMessage } from './test-waits.mjs';

const CLASS_FRAME = {
  k: 'class',
  name: 'SampleTest',
  qualified: 'SampleTest',
  supers: [],
  visibility: 'public',
};
const FUN_FRAME = { k: 'fun', name: 'waits' };
function lambda(host) {
  return { k: 'lambda', host };
}
const loop = (condition, text = 'while (...) { Thread.sleep(10) }') => ({
  k: 'loop',
  condition,
  text,
});
const scopes = (...inner) => [...inner, FUN_FRAME, CLASS_FRAME];

const roots = [];
afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function waitsIn(waits, extra = {}, options = {}) {
  const files = [
    testFile({ classes: [klass('SampleTest')], functions: [testMethod()], waits, ...extra }),
  ];
  return run(testWaitFindings, files, {
    isProduction: productionTypeResolver({ files, projectRoot: '/nonexistent' }),
    ...options,
  });
}

describe('fixed sleeps in Kotlin tests', () => {
  it('reports Thread.sleep and TimeUnit sleep with the Java rule id and exception route', () => {
    const findings = waitsIn([
      wait('sleep'),
      wait('sleep', { qualifier: 'TimeUnit.SECONDS', line: 6 }),
      wait('parkNanos', { qualifier: 'LockSupport', line: 7 }),
    ]);

    expect(summary(findings)).toEqual([
      `${FIXED_SLEEP_RULE} SampleTest.waits 5`,
      `${FIXED_SLEEP_RULE} SampleTest.waits 6`,
      `${FIXED_SLEEP_RULE} SampleTest.waits 7`,
    ]);
    expect(findings[0]).toEqual({
      tool: 'pmd',
      rule: FIXED_SLEEP_RULE,
      path: 'src/test/kotlin/demo/SampleTest.kt',
      identity: 'FixedSleepInTest:SampleTest.waits:sleep',
      symbol: 'SampleTest.waits',
      location: { line: 5 },
      message: waitMessage({ rule: FIXED_SLEEP_RULE, kind: 'sleep' }),
      classification: 'enforceable',
    });
    expect(routeOf(findings[0].message)).toBe(
      'add an exception for pmd/FixedSleepInTest in nitpicker.config.json.',
    );
    expect(new Set(findings.map(({ identity }) => identity)).size).toBe(3);
  });

  it('ignores a sleep method that is not Thread or TimeUnit sleep, and main sources', () => {
    const findings = waitsIn([wait('sleep', { qualifier: 'clock' })], {}, {});
    const inMain = run(testWaitFindings, [file({ waits: [wait('sleep')] })], {
      isProduction: () => false,
    });

    expect([...findings, ...inMain]).toEqual([]);
  });

  it('allows a sleep in a polling loop that tests its condition or reads a clock', () => {
    const polling = loop('!done');
    const clocked = loop(
      'true',
      'while (true) { if (System.nanoTime() > end) break; Thread.sleep(10) }',
    );
    const blind = loop('true');

    const findings = waitsIn([
      wait('sleep', { scopes: scopes(polling), line: 1 }),
      wait('sleep', { scopes: scopes(clocked), line: 2 }),
      wait('sleep', { scopes: scopes(blind), line: 3 }),
    ]);

    expect(summary(findings)).toEqual([`${FIXED_SLEEP_RULE} SampleTest.waits 3`]);
  });

  it('allows a sleep in a mock answer or a thread body and reports it in other lambdas', () => {
    const findings = waitsIn([
      wait('sleep', { scopes: scopes(lambda('answers')), line: 1 }),
      wait('sleep', { scopes: scopes(lambda('thread')), line: 2 }),
      wait('sleep', { scopes: scopes(lambda('Thread')), line: 3 }),
      wait('sleep', { scopes: scopes(lambda('forEach')), line: 4 }),
    ]);

    expect(summary(findings)).toEqual([`${FIXED_SLEEP_RULE} SampleTest.waits 4`]);
  });

  it('reports delay inside runBlocking but not in runTest, launch, or outside any coroutine block', () => {
    const findings = waitsIn([
      wait('delay', { qualifier: undefined, scopes: scopes(lambda('runBlocking')), line: 1 }),
      wait('delay', {
        qualifier: undefined,
        scopes: scopes(lambda('withContext'), lambda('runBlocking')),
        line: 2,
      }),
      wait('delay', { qualifier: undefined, scopes: scopes(lambda('runTest')), line: 3 }),
      wait('delay', {
        qualifier: undefined,
        scopes: scopes(lambda('launch'), lambda('runBlocking')),
        line: 4,
      }),
      wait('delay', { qualifier: undefined, scopes: scopes(), line: 5 }),
    ]);

    expect(summary(findings)).toEqual([
      `${FIXED_SLEEP_RULE} SampleTest.waits 1`,
      `${FIXED_SLEEP_RULE} SampleTest.waits 2`,
    ]);
    expect(findings[0].message).toBe(waitMessage({ rule: FIXED_SLEEP_RULE, kind: 'delay' }));
  });

  it('reports kotest continually, Mockito after(...).never() and Awaitility during as negative waits', () => {
    const imports = [
      { path: 'io.kotest.assertions.timing.continually', all: false },
      { path: 'org.mockito.Mockito.after', all: false },
      { path: 'org.awaitility.Awaitility.await', all: false },
    ];
    const findings = waitsIn(
      [
        wait('continually', { qualifier: undefined, line: 1, arguments: [argument('1.seconds')] }),
        wait('after', { qualifier: undefined, line: 2, outer: { name: 'never', arguments: [] } }),
        wait('after', {
          qualifier: undefined,
          line: 3,
          outer: { name: 'times', arguments: [argument('0')] },
        }),
        wait('after', { qualifier: undefined, line: 4 }),
        wait('during', { qualifier: 'await()', line: 5 }),
        wait('until', { qualifier: 'await().pollDelay(1.seconds)', lambda: 'true', line: 6 }),
        wait('until', { qualifier: 'await()', lambda: 'ready', line: 7 }),
      ],
      { imports },
    );

    expect(summary(findings)).toEqual([
      `${NEGATIVE_WAIT_RULE} SampleTest.waits 1`,
      `${NEGATIVE_WAIT_RULE} SampleTest.waits 2`,
      `${NEGATIVE_WAIT_RULE} SampleTest.waits 3`,
      `${FIXED_SLEEP_RULE} SampleTest.waits 4`,
      `${NEGATIVE_WAIT_RULE} SampleTest.waits 5`,
      `${FIXED_SLEEP_RULE} SampleTest.waits 6`,
    ]);
    expect(routeOf(findings[0].message)).toBe(
      'add an exception for pmd/NegativeWaitInTest in nitpicker.config.json.',
    );
  });

  it('needs the library import before it reads continually, after, during or until as a wait', () => {
    const findings = waitsIn([
      wait('continually', { qualifier: undefined }),
      wait('after', { qualifier: undefined }),
      wait('during', { qualifier: 'await()' }),
    ]);

    expect(findings).toEqual([]);
  });

  it('reports a timed join(ms) with advice to assert the outcome, and leaves a declared helper alone', () => {
    const joined = wait('join', { qualifier: undefined });
    const findings = waitsIn([joined]);
    const helper = waitsIn([joined], { functions: [testMethod(), fn('join')] });

    expect(findings[0].message).toBe(waitMessage({ rule: FIXED_SLEEP_RULE, kind: 'timed' }));
    expect(helper).toEqual([]);
  });

  it('allows a sleep in a test fake of a main type and keeps reporting it in a test of one', () => {
    const files = [
      file({ classes: [klass('Clock')] }),
      testFile({
        classes: [klass('SampleTest'), klass('FakeClock', { supers: ['Clock'] })],
        functions: [testMethod()],
        waits: [
          wait('sleep', {
            scopes: [
              { k: 'fun', name: 'now' },
              {
                k: 'class',
                name: 'FakeClock',
                qualified: 'FakeClock',
                supers: ['Clock'],
                visibility: 'public',
              },
            ],
          }),
          wait('sleep', {
            line: 9,
            scopes: [
              { k: 'fun', name: 'waits' },
              {
                k: 'class',
                name: 'SampleTest',
                qualified: 'SampleTest',
                supers: ['Clock'],
                visibility: 'public',
              },
            ],
          }),
        ],
      }),
    ];

    const findings = run(testWaitFindings, files, {
      isProduction: productionTypeResolver({ files, projectRoot: '/nonexistent' }),
    });

    expect(summary(findings)).toEqual([`${FIXED_SLEEP_RULE} SampleTest.waits 9`]);
  });

  it('resolves a Java main type declared in a main source root', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-waits-'));
    roots.push(root);
    mkdirSync(path.join(root, 'src/main/java/demo'), { recursive: true });
    writeFileSync(
      path.join(root, 'src/main/java/demo/Port.java'),
      'package demo; interface Port {}\n',
    );
    const files = [
      testFile({
        classes: [klass('Fake', { supers: ['Port'] })],
        waits: [
          wait('sleep', {
            scopes: [
              { k: 'fun', name: 'send' },
              {
                k: 'class',
                name: 'Fake',
                qualified: 'Fake',
                supers: ['Port'],
                visibility: 'public',
              },
            ],
          }),
        ],
      }),
    ];

    const findings = run(testWaitFindings, files, {
      isProduction: productionTypeResolver({
        files,
        projectRoot: root,
        javaRoots: ['src/main/java'],
      }),
    });

    expect(findings).toEqual([]);
  });
});
