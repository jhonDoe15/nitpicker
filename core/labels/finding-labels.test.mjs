import { describe, expect, it } from 'vitest';
import { fallbackLabels, findingLabeler, labelCounts, withLabels } from './finding-labels.mts';
import { GOCRITIC_CHECKERS, GO_RULE_NAMES, goLabels } from './go-labels.mts';
import { LABELS } from './taxonomy.mts';
import { areaOf } from '../diff/reporting/format/rule-groups/finding-areas.mts';

const index = {
  entries: [
    {
      id: 'pmd/UnorderedQuery',
      tool: 'pmd',
      rule: 'UnorderedQuery',
      labels: ['bug', 'persistence'],
    },
  ],
  exact: new Map(),
  lowercase: new Map(),
  patterns: [],
};

describe('findingLabeler', () => {
  it('reads the labels of the reference entry', () => {
    const labelsOf = findingLabeler({ areaOf });

    expect(labelsOf({ tool: 'pmd', rule: 'UnorderedQuery' })).toEqual(['bug', 'persistence']);
    expect(labelsOf({ tool: 'eslint-lint', rule: '@typescript-eslint/await-thenable' })).toEqual([
      'bug',
      'async',
    ]);
  });

  it('labels Go findings from its own table', () => {
    const labelsOf = findingLabeler({ areaOf, index: () => index });

    expect(labelsOf({ tool: 'go-rules', rule: 'io_in_loop' })).toEqual(['performance']);
  });

  it('falls back to the area of a finding the reference does not know', () => {
    const labelsOf = findingLabeler({ areaOf, index: () => index });

    expect(labelsOf({ tool: 'prettier-format', rule: 'format' })).toEqual(['style']);
    expect(labelsOf({ tool: 'coverage', rule: 'nothing-known' })).toEqual(['tests']);
    expect(labelsOf({ tool: 'some-tool', rule: 'x' })).toEqual(['maintainability']);
  });

  it('reads the index once per tool and rule', () => {
    let reads = 0;
    const labelsOf = findingLabeler({
      areaOf,
      index: () => {
        reads += 1;
        return index;
      },
    });

    labelsOf({ tool: 'some-tool', rule: 'x' });
    labelsOf({ tool: 'some-tool', rule: 'x' });

    expect(reads).toBe(1);
  });
});

describe('fallbackLabels', () => {
  it('labels type errors as bugs', () => {
    expect(fallbackLabels('types')).toEqual(['bug']);
  });
});

describe('withLabels and labelCounts', () => {
  it('copies each finding with its labels and counts them in taxonomy order', () => {
    const findings = withLabels(
      [
        { tool: 'a', rule: 'x' },
        { tool: 'b', rule: 'y' },
      ],
      ({ tool }) => (tool === 'a' ? ['style'] : ['bug', 'async']),
    );

    expect(findings[1]).toEqual({ tool: 'b', rule: 'y', labels: ['bug', 'async'] });
    expect(labelCounts([...findings, { labels: ['bug'] }])).toEqual({ bug: 2, style: 1, async: 1 });
    expect(Object.keys(labelCounts([...findings, { labels: ['bug'] }]))).toEqual([
      'bug',
      'style',
      'async',
    ]);
  });
});

describe('goLabels', () => {
  it.each([
    ['staticcheck', 'SA1019', ['bug']],
    ['staticcheck', 'ST1003', ['style']],
    ['staticcheck', 'QF1001', ['simplification']],
    ['staticcheck', 'S1000', ['simplification']],
    ['gocritic', 'sqlQuery', ['bug', 'persistence']],
    ['gocritic', 'unlisted', ['simplification']],
    ['go-rules', 'unindexed_foreign_key', ['performance', 'persistence']],
    ['go-rules', 'unlisted', ['maintainability']],
    ['gosec', 'G101', ['security']],
  ])('labels %s/%s', (tool, rule, labels) => {
    expect(goLabels(tool, rule)).toEqual(labels);
  });

  it('leaves other tools to the reference', () => {
    expect(goLabels('eslint-lint', 'no-var')).toBeUndefined();
  });

  it('uses only labels of the taxonomy, kinds first', () => {
    const all = [
      ...GO_RULE_NAMES.map((rule) => goLabels('go-rules', rule)),
      ...GOCRITIC_CHECKERS.map((rule) => goLabels('gocritic', rule)),
    ];

    expect(all.flat().filter((label) => !LABELS.includes(label))).toEqual([]);
  });
});
