import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../test-support/gradle-e2e.mjs';
import { pitStatuses } from './test-support/pit-statuses.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const roots = [];

const CALC = `package demo.calc;

public final class Calc {
  public int twice(int value) {
    return value * 2;
  }
}
`;
const WORDS = `package demo.text;

public final class Words {
  public boolean isShort(String text) {
    return text.length() < 4;
  }
}
`;
const WORDS_TEST = `package demo.text;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class WordsTest {
  @Test
  void tellsShortWords() {
    assertTrue(new Words().isShort("ab"));
    assertFalse(new Words().isShort("abcdef"));
  }
}
`;
const CALC_TEST = `package demo.calc;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class CalcTest {
  @Test
  void doublesTheValue() {
    assertEquals(6, new Calc().twice(3));
  }
}
`;

function project(sources) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pit-history-'));
  roots.push(root);
  const fixture = path.resolve(import.meta.dirname, '../fixtures/gradle-project');
  writeFileSync(
    path.join(root, 'settings.gradle'),
    "rootProject.name = 'demo'\ninclude 'calc', 'text'\n",
  );
  for (const module of ['calc', 'text']) {
    mkdirSync(path.join(root, module));
    cpSync(path.join(fixture, 'build.gradle'), path.join(root, module, 'build.gradle'));
  }
  for (const [file, text] of Object.entries(sources)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function sources(calc) {
  return {
    'calc/src/main/java/demo/calc/Calc.java': calc,
    'calc/src/test/java/demo/calc/CalcTest.java': CALC_TEST,
    'text/src/main/java/demo/text/Words.java': WORDS,
    'text/src/test/java/demo/text/WordsTest.java': WORDS_TEST,
  };
}

function runPit(root, properties = []) {
  const result = spawnSync(
    gradle,
    ['--console=plain', '--quiet', ...properties, '-I', INIT_SCRIPT, 'nitpickerPit'],
    { cwd: root, encoding: 'utf8', timeout: GRADLE_STEP_TIMEOUT_MS },
  );
  expect(result.status, result.stderr).toBe(0);
  return ['calc', 'text'].flatMap((module) =>
    pitStatuses(readFileSync(path.join(root, module, 'build/nitpicker/pit/mutations.xml'), 'utf8')),
  );
}

describe.skipIf(!enabled)('PIT history between base and head', () => {
  afterAll(() => {
    spawnSync(gradle, ['--stop'], { stdio: 'ignore', timeout: GRADLE_STEP_TIMEOUT_MS });
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reruns only the changed class on head, with the statuses of a full run', () => {
    const base = project(sources(CALC));
    const changed = sources(CALC.replace('value * 2', 'value + value'));
    runPit(base, ['-Pnitpicker.pit.recordHistory=true']);

    expect(
      ['calc', 'text'].map((module) =>
        existsSync(path.join(base, module, 'build/nitpicker-pit-history/test.history')),
      ),
    ).toEqual([true, true]);
    const reused = runPit(project(changed), [`-Pnitpicker.pit.historyRoot=${base}`]);
    const full = runPit(project(changed));

    expect(reused.map(({ key, status }) => [key, status])).toEqual(
      full.map(({ key, status }) => [key, status]),
    );
    const testsRun = (className) =>
      reused.filter((mutant) => mutant.className === className).map(({ ran }) => ran);
    expect(testsRun('demo.text.Words').every((ran) => ran === 0)).toBe(true);
    expect(testsRun('demo.calc.Calc').some((ran) => ran > 0)).toBe(true);
  }, 180_000);
});
