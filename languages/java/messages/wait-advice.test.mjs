import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FIXED_SLEEP_RULE, withWaitAdvice } from './wait-advice.mjs';
import { applyRuleMessages } from './rule-messages.mjs';
import { exceptionHint } from '../../../shared/rules/exceptions.mjs';

const sleep = {
  tool: 'pmd',
  rule: FIXED_SLEEP_RULE,
  path: 'src/test/java/shop/OrderTest.java',
  identity: 'sleep',
  message:
    'A fixed wait makes the test slow and flaky. Wait on the condition: check it in a while loop.',
  classification: 'enforceable',
};
const other = { ...sleep, rule: 'NegativeWaitInTest', message: 'Do not prove absence by waiting.' };
const roots = [];

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-wait-advice-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('withWaitAdvice', () => {
  it('names Awaitility when the project has it on the test classpath', () => {
    const [advised, untouched] = withWaitAdvice([sleep, other], {
      manifest: { testAwaitility: true },
    });

    expect(advised.message).toMatch(
      /^A fixed wait .* with Awaitility, which the project's tests use: /u,
    );
    expect(advised.message).toMatch(/not pollDelay\(\.\.\.\)\.until\(\(\) -> true\)/u);
    expect(advised.message).toMatch(/A sleep in a mock answer or a thread body is allowed\.$/u);
    expect(applyRuleMessages([advised])[0].message).toBe(
      `${advised.message} ${exceptionHint('pmd/FixedSleepInTest', sleep.path)}`,
    );
    expect(untouched).toBe(other);
  });

  it('keeps the deadline poll advice without Awaitility', () => {
    expect(withWaitAdvice([sleep], { manifest: { testAwaitility: false } })).toEqual([sleep]);
    expect(withWaitAdvice([sleep], { manifest: {} })).toEqual([sleep]);
  });

  it('names Awaitility when a Java or Kotlin test imports it', () => {
    const java = projectWith({
      'src/test/java/shop/OrderTest.java':
        'package shop;\n\nimport static org.awaitility.Awaitility.await;\n',
    });
    const kotlin = projectWith({
      'src/test/kotlin/shop/OrderTest.kt': 'package shop\n\nimport org.awaitility.kotlin.await\n',
    });
    const javaRoots = { testSourceRoots: ['src/test/java'] };
    const kotlinRoots = { testSourceRoots: [], kotlinTestSourceRoots: ['src/test/kotlin'] };

    expect(withWaitAdvice([sleep], { manifest: javaRoots, projectRoot: java })[0].message).toMatch(
      /with Awaitility/u,
    );
    expect(
      withWaitAdvice([sleep], { manifest: kotlinRoots, projectRoot: kotlin })[0].message,
    ).toMatch(/with Awaitility/u);
  });

  it('does not count Awaitility named only in a comment or in main code', () => {
    const root = projectWith({
      'src/test/java/shop/OrderTest.java':
        'package shop;\n\n// import org.awaitility.Awaitility;\n',
      'src/main/java/shop/Order.java': 'package shop;\n\nimport org.awaitility.Awaitility;\n',
    });

    expect(
      withWaitAdvice([sleep], {
        manifest: { testSourceRoots: ['src/test/java'] },
        projectRoot: root,
      }),
    ).toEqual([sleep]);
  });
});

describe('withWaitAdvice for a timed wait', () => {
  const join = {
    ...sleep,
    path: 'src/test/java/shop/WorkerTest.java',
    location: { line: 4 },
  };
  const root = () =>
    projectWith({
      'src/test/java/shop/WorkerTest.java': [
        'package shop;',
        '',
        'class WorkerTest {',
        '  void runs() { worker.join(1000); lock.wait(5); }',
        '  void sleeps() { Thread.sleep(5); }',
        '}',
      ].join('\n'),
    });

  it('calls join(ms) and wait(ms) timed waits that return early and asks to check the outcome', () => {
    const [timed, fixed] = withWaitAdvice([join, { ...join, location: { line: 5 } }], {
      manifest: {},
      projectRoot: root(),
    });

    expect(timed.message).toMatch(
      /^A timed wait, join\(ms\) or wait\(ms\), returns as soon as the thread ends or is notified/u,
    );
    expect(timed.message).toMatch(
      /assertThat\(thread\.join\(Duration\.ofSeconds\(5\)\)\)\.isTrue\(\)/u,
    );
    expect(timed.message).not.toMatch(/Awaitility/u);
    expect(fixed).toEqual({ ...join, location: { line: 5 } });
  });

  it('offers Awaitility for a timed wait when the tests use it', () => {
    const [timed] = withWaitAdvice([join], {
      manifest: { testAwaitility: true },
      projectRoot: root(),
    });

    expect(timed.message).toMatch(
      /^A timed wait, .*until\(\(\) -> !thread\.isAlive\(\)\) with Awaitility/u,
    );
  });
});
