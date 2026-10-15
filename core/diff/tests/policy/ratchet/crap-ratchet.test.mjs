import { describe, expect, it } from 'vitest';
import { crapFindings } from '../../../../../shared/rules/crap.mjs';
import { compareFindings } from '../../../comparison/compare.mjs';
import { parseFinding } from '../../../comparison/finding-schema.mjs';

function crapFunction({ score, hash, name = 'priceOf', path = 'src/price.ts' }) {
  return {
    path,
    name,
    identity: `function:${name}:occurrence:1:source:${hash}`,
    ratchetKey: `function:${name}:occurrence:1:crap`,
    crap: score,
  };
}

function crapComparison(base, head, renames) {
  const parse = (functions) =>
    crapFindings(functions, { tool: 'crap', limit: 9 }).map((finding) => parseFinding(finding));
  return compareFindings({
    baseFindings: parse(base),
    headFindings: parse(head),
    baseToHeadRenames: renames,
  });
}

describe('CRAP limit on edited legacy functions', () => {
  it('keeps an edited function baselined when its score is unchanged', () => {
    const result = crapComparison(
      [crapFunction({ score: 15, hash: 'before' })],
      [crapFunction({ score: 15, hash: 'after' })],
    );

    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.unchangedFindings).toEqual([
      {
        tool: 'crap',
        rule: 'crap-score-limit',
        path: 'src/price.ts',
        identity: 'function:priceOf:occurrence:1:source:after',
        message:
          'priceOf has CRAP 15.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function. If a reviewer agrees this is intended, add {"rule":"crap-score-limit","paths":["src/price.ts"],"function":"priceOf","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        symbol: 'priceOf',
        ratchet: {
          key: 'function:priceOf:occurrence:1:crap',
          value: 15,
          worseMessage:
            'priceOf CRAP rose from {base} to 15 (limit 9). Put new code in a new function and cover it with tests. If a reviewer agrees this is intended, add {"rule":"crap-score-limit","paths":["src/price.ts"],"function":"priceOf","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
          heldMessage:
            'priceOf: CRAP 15.00 (limit 9), allowed because base was {base}; any increase fails.',
        },
        heldAtBase: 15,
      },
    ]);
  });
  it('carries a held note that shows the score, the limit and the base', () => {
    const result = crapComparison(
      [crapFunction({ score: 16.02, hash: 'before' })],
      [crapFunction({ score: 10, hash: 'after' })],
    );

    expect(result.unchangedFindings.map(({ ratchet }) => ratchet.heldMessage)).toEqual([
      'priceOf: CRAP 10.00 (limit 9), allowed because base was {base}; any increase fails.',
    ]);
  });
  it('keeps an edited function baselined when its score fell but is still over the limit', () => {
    const result = crapComparison(
      [crapFunction({ score: 15, hash: 'before' })],
      [crapFunction({ score: 12.5, hash: 'after' })],
    );

    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
  });
  it('ignores noise below the two decimals the message shows', () => {
    const result = crapComparison(
      [crapFunction({ score: 15.001, hash: 'before' })],
      [crapFunction({ score: 15.004, hash: 'after' })],
    );

    expect(result.newFindings).toEqual([]);
  });
  it('fails an edited function whose score rose and says from what', () => {
    const result = crapComparison(
      [crapFunction({ score: 15, hash: 'before' })],
      [crapFunction({ score: 17.5, hash: 'after' })],
    );

    expect(result.newFindings.map(({ message }) => message)).toEqual([
      'priceOf CRAP rose from 15 to 17.5 (limit 9). Put new code in a new function and cover it with tests. If a reviewer agrees this is intended, add {"rule":"crap-score-limit","paths":["src/price.ts"],"function":"priceOf","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
    ]);
  });
  it('fails a function the change pushes over the limit, with the plain message', () => {
    const result = crapComparison(
      [crapFunction({ score: 4, hash: 'before' })],
      [crapFunction({ score: 15, hash: 'after' })],
    );

    expect(result.newFindings.map(({ message }) => message)).toEqual([
      'priceOf has CRAP 15.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function. If a reviewer agrees this is intended, add {"rule":"crap-score-limit","paths":["src/price.ts"],"function":"priceOf","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
    ]);
  });
  it('fails a new function over the limit', () => {
    const result = crapComparison([], [crapFunction({ score: 15, hash: 'after' })]);

    expect(result.newFindings).toHaveLength(1);
  });
  it('follows renamed files', () => {
    const result = crapComparison(
      [crapFunction({ score: 15, hash: 'before', path: 'src/old.ts' })],
      [crapFunction({ score: 15, hash: 'after', path: 'src/new.ts' })],
      new Map([['src/old.ts', 'src/new.ts']]),
    );

    expect(result.newFindings).toEqual([]);
  });
  it('fails every edit when the adapter gives no ratchet key', () => {
    const withoutKey = (hash) => ({ ...crapFunction({ score: 15, hash }), ratchetKey: undefined });

    const result = crapComparison([withoutKey('before')], [withoutKey('after')]);

    expect(result.newFindings).toHaveLength(1);
  });
  it('never ratchets a function with unknown coverage', () => {
    const unknown = (hash) => crapFunction({ score: Number.NaN, hash });

    const result = crapComparison([unknown('before')], [unknown('after')]);

    expect(result.newFindings).toEqual([
      {
        tool: 'crap',
        rule: 'crap-coverage-unknown',
        path: 'src/price.ts',
        identity: 'function:priceOf:occurrence:1:source:after',
        message:
          'priceOf has unknown coverage and no CRAP score: no test runs it. Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that. If a reviewer agrees this is intended, add {"rule":"crap-coverage-unknown","paths":["src/price.ts"],"function":"priceOf","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        symbol: 'priceOf',
      },
    ]);
  });
});
