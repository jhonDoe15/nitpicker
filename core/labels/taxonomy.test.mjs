import { describe, expect, it } from 'vitest';
import {
  LABELS,
  filterText,
  isKind,
  labelFilter,
  matchesFilter,
  selectedLabels,
} from './taxonomy.mts';

describe('labelFilter', () => {
  it('splits the labels into kinds and frameworks in taxonomy order', () => {
    const filter = labelFilter(['spring', 'performance', 'bug']);

    expect(filter).toEqual({ kinds: ['bug', 'performance'], frameworks: ['spring'] });
    expect(selectedLabels(filter)).toEqual(['bug', 'performance', 'spring']);
  });

  it('is undefined when no label is given', () => {
    expect(labelFilter([])).toBeUndefined();
  });

  it('names an unknown label with the closest one and the known labels', () => {
    expect(() => labelFilter(['bugs'])).toThrow(
      `Unknown --label: bugs. Did you mean bug? Known labels: ${LABELS.join(', ')}.`,
    );
    expect(() => labelFilter(['perf'])).toThrow('Unknown --label: perf. Did you mean performance?');
    expect(() => labelFilter(['zzz'])).toThrow('Unknown --label: zzz. Known labels:');
  });
});

describe('matchesFilter', () => {
  const filter = { kinds: ['bug', 'performance'], frameworks: ['spring'] };

  it('takes any kind and narrows with any framework', () => {
    expect(matchesFilter(['bug', 'spring'], filter)).toBe(true);
    expect(matchesFilter(['performance', 'persistence', 'spring'], filter)).toBe(true);
    expect(matchesFilter(['bug'], filter)).toBe(false);
    expect(matchesFilter(['style', 'spring'], filter)).toBe(false);
  });

  it('matches every kind when only frameworks are chosen', () => {
    expect(matchesFilter(['style', 'react'], { kinds: [], frameworks: ['react'] })).toBe(true);
  });
});

describe('filterText', () => {
  it('joins kinds and frameworks the way they combine', () => {
    expect(filterText({ kinds: ['bug', 'performance'], frameworks: ['spring'] })).toBe(
      'bug or performance in spring code',
    );
    expect(filterText({ kinds: [], frameworks: ['react'] })).toBe('react');
    expect(filterText({ kinds: ['style'], frameworks: [] })).toBe('style');
  });
});

describe('isKind', () => {
  it('tells kinds from frameworks', () => {
    expect(LABELS.filter(isKind)).toEqual([
      'bug',
      'security',
      'performance',
      'reliability',
      'simplification',
      'maintainability',
      'tests',
      'style',
    ]);
  });
});
