import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FIXED_SLEEP_RULE, withWaitAdvice } from './wait-advice.mjs';

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
    expect(advised.message).toMatch(
      /exception for pmd\/FixedSleepInTest in nitpicker\.config\.json\.$/u,
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
