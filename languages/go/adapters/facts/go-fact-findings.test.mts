import { describe, expect, it } from 'vitest';
import { goFactFindings } from './go-fact-findings.mts';
import { goFacts } from './go-facts.mts';
import { reportUsage } from '../test-support/go-report-fixtures.mts';
import type { FindingRow, GoDefinition, GoUsage } from '../go-types.mts';

const BODY = [
  'func',
  'clamp',
  '(',
  'value',
  ',',
  'low',
  ',',
  'high',
  'int',
  ')',
  'int',
  '{',
  'if',
  'value',
  '<',
  'low',
  '{',
  'return',
  'low',
  '}',
  'if',
  'value',
  '>',
  'high',
  '{',
  'return',
  'high',
  '}',
  'return',
  'value',
  '}',
];

function file(path: string, constrained = false) {
  return { path, package: path.split('/')[0] ?? '', test: false, generated: false, constrained };
}

function clamp(path: string, tokens = BODY, kind = 'function'): GoDefinition {
  return {
    file: path,
    name: 'clamp',
    kind,
    line: 3,
    lines: 9,
    exported: false,
    entry: false,
    literal: false,
    tokens,
  };
}

function usage(path: string, extra: Partial<GoUsage> = {}) {
  return reportUsage(path, { local: ['clamp'], ...extra });
}

function report(
  definitions: readonly GoDefinition[],
  { constrained = [] }: { constrained?: readonly string[] } = {},
) {
  return {
    files: ['billing/total.go', 'report/sum.go'].map((path) =>
      file(path, constrained.includes(path)),
    ),
    definitions,
    usages: ['billing/total.go', 'report/sum.go'].map((path) => usage(path)),
  };
}

function duplicates(input: ReturnType<typeof report>) {
  return goFactFindings(goFacts(input, { module: 'shop' })).map(
    ({ rule, path }) => `${rule} ${path}`,
  );
}

function rows(findings: readonly FindingRow[]) {
  return findings.map(({ rule, path, message }) => `${rule} ${path}: ${message}`);
}

describe('shared fact rules on Go facts', () => {
  it('reports a function copied into another package of the module', () => {
    const facts = goFacts(report([clamp('billing/total.go'), clamp('report/sum.go')]), {
      module: 'shop',
    });

    expect(rows(goFactFindings(facts))).toEqual([
      'duplicate-definition billing/total.go: clamp is also defined with the same code in report/sum.go. Move it to one package, export it and import it. If this is intended, add {"rule":"duplicate-definition","paths":["billing/total.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      'duplicate-definition report/sum.go: clamp is also defined with the same code in billing/total.go. Move it to one package, export it and import it. If this is intended, add {"rule":"duplicate-definition","paths":["report/sum.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it('reports a copy edited away from its unedited sibling', () => {
    const before = report([clamp('billing/total.go'), clamp('report/sum.go')]);
    const edited = BODY.map((token, index) => (index === 29 ? 'low' : token));
    const after = report([clamp('billing/total.go', edited), clamp('report/sum.go')]);

    const findings = goFactFindings(goFacts(after, { module: 'shop' }), {
      baseline: { facts: goFacts(before, { module: 'shop' }) },
    });

    expect(findings.map(({ rule, path }) => `${rule} ${path}`)).toEqual([
      'sibling-copy-edit billing/total.go',
    ]);
  });

  it('counts a helper called from another file of its package as used', () => {
    const input = report([clamp('billing/total.go'), clamp('report/sum.go')]);
    const split = {
      files: [...input.files, file('report/main.go')],
      definitions: input.definitions,
      usages: [
        usage('billing/total.go'),
        usage('report/sum.go', { local: [] }),
        usage('report/main.go', { names: ['clamp'], local: [] }),
      ],
    };

    expect(duplicates(split)).toEqual([
      'duplicate-definition billing/total.go',
      'duplicate-definition report/sum.go',
    ]);
  });

  it.each([
    ['a build-constrained platform variant', { constrained: ['report/sum.go'] }, 'function'],
    ['a type', {}, 'type'],
  ])('leaves out %s', (_label, options, kind) => {
    const input = report(
      [clamp('billing/total.go', BODY, kind), clamp('report/sum.go', BODY, kind)],
      options,
    );

    expect(duplicates(input)).toEqual([]);
  });
});
