import { rmSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  enabled,
  gradle,
  roots,
  comparable,
  consoleChange,
  RECEIPT_CONSOLE_FINDING,
} from '../__tests__/spring-project.mjs';

describe.skipIf(!enabled)('New console output of tests on Gradle builds', () => {
  let findings;

  beforeAll(() => {
    findings = consoleChange({ gradle, policy: {} }, 'pom.xml');
  }, 300_000);

  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports only the line the change adds, not Spring startup, logged warnings or renumbered output', () => {
    expect(
      findings.map(({ path: file, message }) => `${file} ${message.split('. Fix')[0]}`),
    ).toEqual([
      '. Tests print new console output: "receipt total drifted by <n> cents" (src/test/java/shop/ReceiptTest.java, test "printsTheDrift")',
    ]);
    expect(comparable(findings)).toEqual(comparable([RECEIPT_CONSOLE_FINDING]));
  });
});
