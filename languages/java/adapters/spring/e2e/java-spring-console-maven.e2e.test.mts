import { rmSync } from 'node:fs';

import type { JavaFinding } from '../../typed/java-values.mts';
import { textOf } from '../../../../../shared/values/readers.mts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  enabled,
  maven,
  roots,
  comparable,
  consoleChange,
  RECEIPT_CONSOLE_FINDING,
} from '../__tests__/spring-project.mts';

describe.skipIf(!enabled)('New console output of tests on Maven builds', () => {
  let findings: JavaFinding[];

  beforeAll(() => {
    findings = consoleChange({ maven, policy: {} }, 'build.gradle', 'settings.gradle');
  }, 300_000);

  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports only the line the change adds, not Spring startup, logged warnings or renumbered output', () => {
    expect(
      findings.map(
        ({ path: file, message }) => `${file} ${String(textOf(message).split('. Fix')[0])}`,
      ),
    ).toEqual([
      '. Tests print new console output: "receipt total drifted by <n> cents" (src/test/java/shop/ReceiptTest.java, test "printsTheDrift")',
    ]);
    expect(comparable(findings)).toEqual(comparable([RECEIPT_CONSOLE_FINDING]));
  });
});
