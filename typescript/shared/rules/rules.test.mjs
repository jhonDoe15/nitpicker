import { describe, expect, it } from 'vitest';
import { evaluateBaselineExpansions } from './baseline-expansion.mjs';
import { evaluateCoupling } from './coupling.mjs';
import { evaluateDuplicates } from './duplicates.mjs';
import { evaluateStructure } from './structure.mjs';
import { evaluateTestRuntime } from './test-runtime.mjs';

const byRule = (findings, rule) => findings.filter((finding) => finding.rule === rule);

describe('structure rule on neutral function metrics', () => {
  const fn = (overrides) => ({
    file: 'src/A.java',
    name: 'run',
    start: 10,
    end: 90,
    lines: 80,
    statements: 5,
    maxControlNesting: 1,
    parameters: 1,
    ...overrides,
  });

  it('fails a metric above its limit and keeps the others descriptive', () => {
    const findings = evaluateStructure({ functions: [fn()] }, 'structure');
    const violations = findings.filter((finding) => finding.classification === 'enforceable');
    expect(violations).toEqual([
      expect.objectContaining({
        rule: 'function-lines-limit',
        path: 'src/A.java',
        message: 'run has 80 lines; limit is 50',
        symbol: 'run',
        location: { line: 10 },
      }),
    ]);
    expect(byRule(findings, 'function-structure').map((finding) => finding.metric.name)).toEqual([
      'lines',
      'statements',
      'maxControlNesting',
      'parameters',
    ]);
  });

  it('does not fail a metric exactly at its limit', () => {
    const findings = evaluateStructure(
      { functions: [fn({ lines: 50, statements: 15, maxControlNesting: 2, parameters: 3 })] },
      'structure',
    );
    expect(findings.some((finding) => finding.classification === 'enforceable')).toBe(false);
  });

  it('identifies repeated names by occurrence and keys the violation on the source hash', () => {
    const [first, second] = evaluateStructure(
      {
        functions: [fn({ parameters: 9, sourceHash: 'a' }), fn({ parameters: 9, sourceHash: 'b' })],
      },
      'structure',
    ).filter(
      (finding) => finding.classification === 'enforceable' && finding.rule.includes('param'),
    );
    expect(first.identity).toBe('function:run:occurrence:1:source:a');
    expect(second.identity).toBe('function:run:occurrence:2:source:b');
  });

  it('reports summary, distributions and class metrics as descriptive', () => {
    const findings = evaluateStructure(
      {
        summary: { functions: 2 },
        distributions: { lines: { p90: 12 } },
        classes: [{ file: 'src/A.java', name: 'A', start: 1, end: 5, methods: 3 }],
      },
      'structure',
    );
    expect(findings.map((finding) => [finding.rule, finding.identity])).toEqual([
      ['structure', 'summary:functions'],
      ['distribution', 'lines:p90'],
      ['class-structure', 'class:A:occurrence:1:methods'],
    ]);
  });
});

describe('coupling rule on neutral module and package metrics', () => {
  it('emits module and package metrics and one failure per stability violation', () => {
    const findings = evaluateCoupling(
      {
        summary: { modules: 2 },
        modules: [{ file: 'a/A.java', fanIn: 1, fanOut: 2, instability: 0.5 }],
        packages: [{ name: 'a', modules: 1, instability: 0.2, cohesion: { internalEdges: 0 } }],
        stabilityDirection: [{ source: 'a', target: 'b', delta: 0.4 }],
      },
      'coupling',
    );
    expect(byRule(findings, 'module-coupling').map((finding) => finding.identity)).toEqual([
      'module:fanIn',
      'module:fanOut',
      'module:instability',
    ]);
    expect(byRule(findings, 'package-coupling').map((finding) => finding.identity)).toEqual([
      'package:a:modules',
      'package:a:instability',
      'package:a:internalEdges',
    ]);
    expect(byRule(findings, 'stability-direction')).toEqual([
      {
        tool: 'coupling',
        rule: 'stability-direction',
        path: '.',
        identity: 'package-edge:a->b',
        message: 'a depends on less stable package b',
        classification: 'enforceable',
      },
    ]);
    expect(byRule(findings, 'stability-direction-metric')[0].metric).toEqual({
      name: 'instabilityDelta',
      value: 0.4,
    });
  });

  it('accepts an empty report', () => {
    expect(evaluateCoupling({}, 'coupling')).toEqual([]);
  });
});

describe('test-runtime rule on neutral findings', () => {
  it('fails each finding by test path and counts categories', () => {
    const findings = evaluateTestRuntime(
      {
        summary: { tests: 3, categories: { 'no-production-runtime': 1 } },
        findings: [
          { test: 'test/AT.java', category: 'no-production-runtime', sourceHash: 'h1' },
          { test: 'test/BT.java', category: 'type-only-production-dependency' },
        ],
      },
      'test-runtime',
    );
    expect(byRule(findings, 'category-count')[0].metric).toEqual({
      name: 'no-production-runtime',
      value: 1,
    });
    const failures = findings.filter((finding) => finding.classification === 'enforceable');
    expect(failures[0]).toMatchObject({
      rule: 'no-production-runtime',
      path: 'test/AT.java',
      identity: 'test:test/AT.java:source:h1',
      message: 'Test has no production runtime',
    });
    expect(failures[1].identity).toMatch(/^test:test\/BT\.java:source:[0-9a-f]{24}$/);
  });
});

describe('duplicates rule on neutral clones', () => {
  const clone = (first, second, extra = {}) => ({
    first: { file: first, line: 3 },
    second: { file: second, line: 8 },
    fragment: 'x',
    lines: 6,
    tokens: 60,
    ...extra,
  });

  it('orders the pair by path and numbers repeated pairs', () => {
    const findings = evaluateDuplicates(
      [clone('b.java', 'a.java'), clone('a.java', 'b.java')],
      'duplicates',
    );
    const failures = byRule(findings, 'duplicate-clone');
    expect(failures.map((finding) => [finding.path, finding.message])).toEqual([
      ['a.java', 'Duplicate with b.java'],
      ['a.java', 'Duplicate with b.java'],
    ]);
    expect(failures[0].identity).toMatch(
      /^pair:a\.java\|b\.java:fragment:[0-9a-f]{24}:occurrence:1$/,
    );
    expect(failures[1].identity).toMatch(/:occurrence:2$/);
    expect(failures[0].location).toEqual({ line: 8 });
  });

  it('adds size metrics and omits a location for an unusable line', () => {
    const findings = evaluateDuplicates(
      [clone('a.java', 'b.java', { first: { file: 'a.java' } })],
      'duplicates',
    );
    expect(byRule(findings, 'duplicate-clone-size').map((finding) => finding.metric)).toEqual([
      { name: 'lines', value: 6 },
      { name: 'tokens', value: 60 },
    ]);
    expect(byRule(findings, 'duplicate-clone')[0]).not.toHaveProperty('location');
  });
});

describe('baseline-expansion rule on neutral sites', () => {
  const site = { file: 'src/a.ts', rule: 'any', source: 'x as any', count: 1 };

  it('fails a raised or new allowance and ignores equal or lower ones', () => {
    expect(evaluateBaselineExpansions([site], [{ ...site, count: 3 }], 'cs')).toEqual([
      expect.objectContaining({
        rule: 'baseline-expansion',
        path: 'src/a.ts',
        message: 'Legacy allowance increased from 1 to 3 for any',
        classification: 'enforceable',
      }),
    ]);
    expect(evaluateBaselineExpansions([], [site], 'cs')[0].message).toContain('from 0 to 1');
    expect(evaluateBaselineExpansions([{ ...site, count: 2 }], [site], 'cs')).toEqual([]);
  });

  it('rejects malformed sites and counts', () => {
    expect(() => evaluateBaselineExpansions([], [{ file: 'a' }], 'cs')).toThrow(TypeError);
    expect(() => evaluateBaselineExpansions([], [{ ...site, count: 0 }], 'cs')).toThrow(TypeError);
  });
});
