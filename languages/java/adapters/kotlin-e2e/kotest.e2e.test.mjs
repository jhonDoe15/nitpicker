import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import { gradle, kotlinE2eEnabled, kotlinPolicy } from './test-support/kotlin-e2e-project.mjs';

const fixture = path.resolve(import.meta.dirname, '../fixtures/test-frameworks/kotest');
const CALC = 'src/main/kotlin/demo/Calc.kt';
const temporary = [];

afterAll(() => {
  for (const root of temporary.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset on a Kotest project', () => {
  it('tells mutants apart, runs ArchUnit rules and places slow tests on their spec file', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotest-'));
    temporary.push(root);
    cpSync(fixture, root, { recursive: true });

    const findings = collectJavaFindings(root, {
      gradle,
      policy: { ...kotlinPolicy, testSeconds: { unitTestSeconds: -1 } },
    });

    expect(
      findings
        .filter(({ tool }) => tool === 'test-runtime')
        .map(({ path: file, identity, location }) => ({ file, identity, location }))
        .sort((left, right) => left.identity.localeCompare(right.identity)),
    ).toEqual(
      ['calls plusOne', 'doubles the value'].map((name) => ({
        file: 'src/test/kotlin/demo/CalcSpec.kt',
        identity: `test:demo.CalcSpec#${name}`,
        location: undefined,
      })),
    );
    expect(
      findings
        .filter(({ tool }) => ['archunit', 'pit'].includes(tool))
        .map(({ tool, rule, path: file, identity, metric }) =>
          [tool, rule, file, identity, metric?.value]
            .filter((part) => part !== undefined)
            .join(' '),
        )
        .sort(),
    ).toEqual([
      `archunit servicesOnly ${CALC} demo.Calc`,
      `pit mutant-nocoverage ${CALC} Calc|half(I)I|MathMutator|Replaced integer division with multiplication#1`,
      `pit mutant-nocoverage ${CALC} Calc|half(I)I|PrimitiveReturnsMutator|replaced int return with 0 for Calc::half#1`,
      `pit mutant-survived ${CALC} Calc|plusOne(I)I|MathMutator|Replaced integer addition with subtraction#1`,
      `pit mutant-survived ${CALC} Calc|plusOne(I)I|PrimitiveReturnsMutator|replaced int return with 0 for Calc::plusOne#1`,
      'pit mutation-summary . status:Killed 2',
      'pit mutation-summary . status:NoCoverage 2',
      'pit mutation-summary . status:Survived 2',
    ]);
  });
});
