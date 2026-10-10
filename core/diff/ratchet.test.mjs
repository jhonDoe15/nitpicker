import { describe, expect, it } from 'vitest';
import { evaluateStructure } from '../../shared/rules/structure.mjs';
import { compareFindings } from './compare.mjs';
import { parseFinding } from './finding-schema.mjs';

function limitFindings(functions) {
  return evaluateStructure({ functions }, 'structure')
    .filter((finding) => finding.classification === 'enforceable')
    .map((finding) => parseFinding(finding));
}

function legacy(statements, sourceHash, file = 'src/big.ts') {
  return { file, name: 'big', start: 1, end: 200, statements, sourceHash };
}

function compare(base, head, renames) {
  return compareFindings({
    baseFindings: limitFindings(base),
    headFindings: limitFindings(head),
    baseToHeadRenames: renames,
  });
}

describe('size limits on edited legacy functions', () => {
  it('keeps an edited function baselined when its metric does not grow', () => {
    const result = compare([legacy(80, 'before')], [legacy(78, 'after')]);
    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.unchangedFindings).toMatchObject([
      { rule: 'function-statements-limit', heldAtBase: 80 },
    ]);
  });

  it('fails an edited function whose metric grows past the base value', () => {
    const result = compare([legacy(80, 'before')], [legacy(81, 'after')]);
    expect(result.newFindings).toMatchObject([{ rule: 'function-statements-limit' }]);
    expect(result.resolvedFindings).toHaveLength(1);
  });

  it('fails a function the change pushes over the limit', () => {
    const result = compare([legacy(10, 'before')], [legacy(80, 'after')]);
    expect(result.newFindings).toHaveLength(1);
  });

  it('fails a new function over the limit', () => {
    const result = compare([], [legacy(80, 'after')]);
    expect(result.newFindings).toHaveLength(1);
  });

  it('follows renamed files', () => {
    const result = compare(
      [legacy(80, 'before', 'src/old.ts')],
      [legacy(80, 'after', 'src/new.ts')],
      new Map([['src/old.ts', 'src/new.ts']]),
    );
    expect(result.newFindings).toEqual([]);
  });
});
