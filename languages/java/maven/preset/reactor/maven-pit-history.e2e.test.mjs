import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../../adapters/java-diff.mjs';
import { pitStatuses } from '../../../adapters/java-e2e/test-support/pit/pit-statuses.mjs';
import {
  useMavenPresetProject,
  enabled,
  maven,
  fixtures,
  copyOf,
  comparable,
} from '../../__tests__/maven-preset-project.mjs';

const LABELS = `package demo.core;

public final class Labels {
  public String of(int value) {
    return value % 2 == 0 ? "even" : "odd";
  }
}
`;
const LABELS_TEST = `package demo.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class LabelsTest {
  @Test
  void namesBothKinds() {
    assertEquals("even", new Labels().of(2));
    assertEquals("odd", new Labels().of(3));
  }
}
`;
const ADDER = 'core/src/main/java/demo/core/Adder.java';

function reactor(change) {
  const root = copyOf(path.join(fixtures, 'multi-module'));
  writeFileSync(path.join(root, 'core/src/main/java/demo/core/Labels.java'), LABELS);
  writeFileSync(path.join(root, 'core/src/test/java/demo/core/LabelsTest.java'), LABELS_TEST);
  const adder = path.join(root, ADDER);
  writeFileSync(adder, change(readFileSync(adder, 'utf8')));
  return root;
}

function collect(root, policy) {
  const findings = collectJavaFindings(root, { maven, policy }).filter(
    ({ tool }) => tool === 'pit',
  );
  const xml = readFileSync(path.join(root, 'core/target/nitpicker/pit/mutations.xml'), 'utf8');
  return { findings, mutants: pitStatuses(xml) };
}

describe.skipIf(!enabled)('PIT history between Maven base and head', () => {
  useMavenPresetProject();
  let base;

  beforeAll(() => {
    base = reactor((text) => text);
    collect(base, { snapshot: 'base' });
  }, 300_000);

  it('reruns only the changed class on head, with the findings of a full run', () => {
    const toHead = (text) => text.replace('return a + b;', 'int sum = a + b;\n    return sum;');

    expect(existsSync(path.join(base, 'core/target/nitpicker-pit-history/test.history'))).toBe(
      true,
    );
    const reused = collect(reactor(toHead), { snapshot: 'head', baselineRoot: base });
    const full = collect(reactor(toHead), { snapshot: 'head' });

    expect(comparable(reused.findings)).toEqual(comparable(full.findings));
    expect(reused.mutants.map(({ key, status }) => [key, status])).toEqual(
      full.mutants.map(({ key, status }) => [key, status]),
    );
    const testsRun = (className) =>
      reused.mutants.filter((mutant) => mutant.className === className).map(({ ran }) => ran);
    expect(testsRun('demo.core.Labels').every((ran) => ran === 0)).toBe(true);
    expect(testsRun('demo.core.Adder').some((ran) => ran > 0)).toBe(true);
  }, 180_000);
});
