import { rmSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  enabled,
  gradle,
  maven,
  roots,
  comparable,
  consoleChange,
} from '../__tests__/spring-project.mjs';

describe.skipIf(!enabled)('New console output of tests on Gradle and Maven builds', () => {
  const runs = {};

  beforeAll(() => {
    runs.gradle = consoleChange({ gradle, policy: {} }, 'pom.xml');
    runs.maven = consoleChange({ maven, policy: {} }, 'build.gradle', 'settings.gradle');
  }, 300_000);

  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports only the line the change adds, not Spring startup, logged warnings or renumbered output', () => {
    expect(
      runs.gradle.map(({ path: file, message }) => `${file} ${message.split('. Fix')[0]}`),
    ).toEqual([
      '. Tests print new console output: "receipt total drifted by <n> cents" (src/test/java/shop/ReceiptTest.java, test "printsTheDrift")',
    ]);
    expect(comparable(runs.maven)).toEqual(comparable(runs.gradle));
  });
});
