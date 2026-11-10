import { describe, expect, it } from 'vitest';
import { goFactFindings } from './go-fact-findings.mjs';
import { goFacts } from './go-facts.mjs';

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

function file(path) {
  return { path, package: path.split('/')[0], test: false, generated: false, constrained: false };
}

function clamp(path, tokens = BODY) {
  return {
    file: path,
    name: 'clamp',
    kind: 'function',
    line: 3,
    lines: 9,
    exported: false,
    entry: false,
    literal: false,
    tokens,
  };
}

function report(definitions) {
  return {
    files: ['billing/total.go', 'report/sum.go'].map((path) => file(path)),
    definitions,
    usages: ['billing/total.go', 'report/sum.go'].map((path) => ({
      file: path,
      imports: [],
      names: [],
      selectors: [],
      local: ['clamp'],
    })),
  };
}

function rows(findings) {
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
});
