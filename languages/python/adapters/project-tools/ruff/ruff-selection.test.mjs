import { describe, expect, it } from 'vitest';
import { expandSelectors, resolveSelection, ruleCatalog } from './ruff-selection.mjs';

const catalog = ruleCatalog([
  { code: 'E401', preview: false },
  { code: 'E501', preview: false },
  { code: 'E711', preview: false },
  { code: 'ERA001', preview: false },
  { code: 'F401', preview: false },
  { code: 'D100', preview: false },
  { code: 'D203', preview: false },
  { code: 'DTZ001', preview: false },
  { code: 'PLR2004', preview: false },
  { code: 'PLW0603', preview: false },
  { code: 'PTH100', preview: false },
  { code: 'PT001', preview: false },
  { code: 'RUF100', preview: false },
  { code: 'RUF200', preview: true },
]);

function resolved(layers, preview) {
  return [
    ...resolveSelection(
      layers.map((layer) => ({ extendSelect: [], ignore: [], ...layer })),
      { catalog, preview },
    ),
  ].toSorted();
}

describe('ruff rule selection', () => {
  it('starts from ruff defaults and matches selectors by linter, not by text prefix', () => {
    expect(resolved([])).toEqual(['E401', 'E711', 'F401']);
    expect(resolved([{ select: ['E', 'D', 'PT'] }])).toEqual([
      'D100',
      'D203',
      'E401',
      'E501',
      'E711',
      'PT001',
    ]);
    expect(resolved([{ select: ['PL'] }])).toEqual(['PLR2004', 'PLW0603']);
  });

  it('lets a more specific selector win within a layer, and an ignore win at the same one', () => {
    expect(resolved([{ select: ['D'], ignore: ['D2'] }])).toEqual(['D100']);
    expect(resolved([{ select: ['D203'], ignore: ['D'] }])).toEqual(['D203']);
    expect(resolved([{ select: ['D100'], ignore: ['D100'] }])).toEqual([]);
  });

  it('applies the layers in order, with select starting over and the rest updating', () => {
    expect(resolved([{ select: ['D'] }, { extendSelect: ['F'], ignore: ['D203'] }])).toEqual([
      'D100',
      'F401',
    ]);
    expect(resolved([{ select: ['D'] }, { select: ['F'] }])).toEqual(['F401']);
    expect(resolved([{ select: [], ignore: ['F'] }, { extendSelect: ['F', 'E4'] }])).toEqual([
      'E401',
    ]);
  });

  it('selects preview rules only in preview, and only by code when that is explicit', () => {
    expect(resolved([{ select: ['RUF'] }])).toEqual(['RUF100']);
    expect(resolved([{ select: ['RUF'] }], { enabled: true })).toEqual(['RUF100', 'RUF200']);
    expect(resolved([{ select: ['RUF'] }], { enabled: true, explicit: true })).toEqual(['RUF100']);
    expect(resolved([{ select: ['RUF200'] }], { enabled: true, explicit: true })).toEqual([
      'RUF200',
    ]);
  });

  it('expands ALL, codes and prefixes, and skips selectors it does not know', () => {
    expect(expandSelectors(['ALL'], catalog).size).toBe(catalog.length);
    expect([...expandSelectors(['E7', 'PLR2004', 'not a rule', 42], catalog)]).toEqual([
      'E711',
      'PLR2004',
    ]);
  });
});
