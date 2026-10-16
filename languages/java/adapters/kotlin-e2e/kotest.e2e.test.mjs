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
  it('tells killed, survived and uncovered mutants apart through the JUnit Platform', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotest-'));
    temporary.push(root);
    cpSync(fixture, root, { recursive: true });

    const findings = collectJavaFindings(root, { gradle, policy: kotlinPolicy });

    expect(
      findings
        .filter(({ tool }) => tool === 'pit')
        .map(({ rule, path: file, identity, metric }) =>
          [rule, file, identity, metric?.value].filter((part) => part !== undefined).join(' '),
        )
        .sort(),
    ).toEqual([
      `mutant-nocoverage ${CALC} demo.Calc|half(I)I|MathMutator|Replaced integer division with multiplication#1`,
      `mutant-nocoverage ${CALC} demo.Calc|half(I)I|PrimitiveReturnsMutator|replaced int return with 0 for demo/Calc::half#1`,
      `mutant-survived ${CALC} demo.Calc|plusOne(I)I|MathMutator|Replaced integer addition with subtraction#1`,
      `mutant-survived ${CALC} demo.Calc|plusOne(I)I|PrimitiveReturnsMutator|replaced int return with 0 for demo/Calc::plusOne#1`,
      'mutation-summary . status:Killed 2',
      'mutation-summary . status:NoCoverage 2',
      'mutation-summary . status:Survived 2',
    ]);
  });
});
