import { describe, expect, it, vi } from 'vitest';
import { findNearDuplicates } from './engine.mts';
import type { NearFinding } from './engine.mts';
import { COPIES as FIXTURE } from './test-support/copies.mts';
import { javascriptUnits } from './test-support/javascript.mts';

function summary(findings: readonly NearFinding[]) {
  return findings.map(({ verdict, units, templateHash }) => ({ verdict, units, templateHash }));
}

const LONE = '\uD83D';
const MARKED = [
  `function markLeft(text) {\n  const mark = '${LONE}';\n  let result = '';\n  for (const part of text.split(',')) {`,
  `    if (part.length > 0) {\n      result = result + mark + part.trim() + '${LONE}x';\n    }\n  }`,
  '  return result;\n}',
].join('\n');

function functionsOf(source: string): string[] {
  return source.split(/\n(?=function )/u);
}

describe('finding near-duplicate functions', () => {
  it('gives the same verdicts and template hashes on every machine', () => {
    const findings = findNearDuplicates(javascriptUnits(FIXTURE, { file: 'copies.js' }));

    expect(summary(findings)).toEqual([
      {
        verdict: 'same',
        units: ['copies.js#addWeights', 'copies.js#sumWeights'],
        templateHash: '4b6b5a109d30c328651d32ec017b08ef4483169dc367d7a6d46138e5bc61f95b',
      },
      {
        verdict: 'parameterizable',
        units: ['copies.js#alignBottom', 'copies.js#alignTop'],
        templateHash: 'ba686ce8b3a03d95c05d60452648d3fe51092f7ffce121c325ff2286ef4765b2',
      },
      {
        verdict: 'partial-run',
        units: ['copies.js#jwkMiddleware', 'copies.js#jwtMiddleware'],
        templateHash: '4703b158e9b4619b3b3c8eb7f96e621d4b4972d24c68267ccb7820a1ba195a6b',
      },
      {
        verdict: 'parameterizable',
        units: ['copies.js#readUri', 'copies.js#readUrl'],
        templateHash: 'f225212a7deca7752de2be023b10cd754905e9e2b3eddf80da77c95f760ce635',
      },
    ]);
  });

  it('keeps identities when functions move within or across files', () => {
    const before = findNearDuplicates(javascriptUnits(FIXTURE, { file: 'copies.js' }));
    const moved = functionsOf(FIXTURE).reverse().join('\n\n\n');
    const units = javascriptUnits(moved, { file: 'copies.js' }).map((unit, index) => ({
      ...unit,
      file: index % 2 === 0 ? 'copies.js' : 'other/copies.js',
    }));
    const after = findNearDuplicates(units);

    expect(after.map(({ identity }) => identity)).toEqual(before.map(({ identity }) => identity));
  });

  it('keeps the template hash when locals are renamed or a copy is renamed', () => {
    const base = findNearDuplicates(javascriptUnits(FIXTURE, { file: 'copies.js' }));
    const renamed = FIXTURE.replaceAll('selected', 'chosen')
      .replaceAll('alignTop', 'zAlignTop')
      .replaceAll('sumWeights', 'aSumWeights');
    const after = findNearDuplicates(javascriptUnits(renamed, { file: 'copies.js' }));

    expect(after.map(({ templateHash }) => templateHash).sort()).toEqual(
      base.map(({ templateHash }) => templateHash).sort(),
    );
  });

  it('gives the same findings whatever order the functions arrive in', () => {
    const units = javascriptUnits(FIXTURE, { file: 'copies.js' });

    expect(findNearDuplicates([...units].reverse())).toEqual(findNearDuplicates(units));
  });

  it('compares only pairs that involve a changed function in a change-scoped run', () => {
    const units = javascriptUnits(FIXTURE, { file: 'copies.js' });
    const findings = findNearDuplicates(units, { changed: ['copies.js#readUri'] });

    expect(summary(findings).map(({ units: pair }) => pair)).toEqual([
      ['copies.js#readUri', 'copies.js#readUrl'],
    ]);
  });

  it('describes the parameters a fix would need, with the source lines of both sides', () => {
    const [finding] = findNearDuplicates(javascriptUnits(FIXTURE, { file: 'copies.js' }), {
      changed: ['copies.js#readUri'],
    });

    expect(
      finding?.parameters.map(({ kind, a, b }) => [kind, a.value, b.value, a.start, b.start]),
    ).toEqual([['type', 'URI', 'URL', 19, 7]]);
    expect(finding?.rewritten).toBe(true);
  });

  it('finds the same pairs whether or not the engine searches, even in text with lone surrogates', () => {
    const source = `${FIXTURE}\n\n${MARKED}\n\n${MARKED.replace('markLeft', 'markRight')}`;
    const units = javascriptUnits(source, { file: 'copies.js' });
    const found = findNearDuplicates(units);
    vi.stubEnv('NITPICKER_NEAR_DUPLICATE_ENGINE', 'off');
    const inNode = findNearDuplicates(units);
    vi.unstubAllEnvs();

    expect(found).toEqual(inNode);
    expect(found.map(({ units: pair }) => pair)).toContainEqual([
      'copies.js#markLeft',
      'copies.js#markRight',
    ]);
  });
});
