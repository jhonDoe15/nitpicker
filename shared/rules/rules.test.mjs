import { describe, expect, it } from 'vitest';
import { evaluateBaselineExpansions } from './baseline-expansion.mjs';
import { computeCoupling, evaluateCoupling } from './coupling.mjs';
import { evaluateStructure } from './structure.mjs';
import { evaluateTestRuntime } from './test-runtime/evaluate.mjs';

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
        message:
          'run has 80 lines; limit is 50. If this is intended, add {"rule":"function-lines-limit","paths":["src/A.java"],"function":"run","reason":"..."} to "exceptions" in nitpicker.config.json.',
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

  it('names the exception entry in the failure and in the worse message', () => {
    const [finding] = evaluateStructure({ functions: [fn({ lines: 51 })] }, 'structure').filter(
      (candidate) => candidate.classification === 'enforceable',
    );
    const route =
      'If this is intended, add {"rule":"function-lines-limit","paths":["src/A.java"],"function":"run","reason":"..."} to "exceptions" in nitpicker.config.json.';
    expect(finding.message).toBe(`run has 51 lines; limit is 50. ${route}`);
    expect(finding.ratchet.worseMessage).toBe(
      `run grew from {base} to 51 lines (limit 50). Put new code in a new function. ${route}`,
    );
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

  it('numbers a violation among the entries of the same name and source over the limit when asked to, so no other entry renames it', () => {
    const violations = (functions) =>
      evaluateStructure({ functions }, 'structure')
        .filter((finding) => finding.rule === 'function-control-nesting-limit')
        .map((finding) => [finding.identity, finding.ratchet.key]);
    const nested = (sourceHash) =>
      fn({ name: 'Box.<init>', maxControlNesting: 3, numberedAmongSameSource: true, sourceHash });
    const quiet = (sourceHash) =>
      fn({ name: 'Box.<init>', maxControlNesting: 1, numberedAmongSameSource: true, sourceHash });
    const legacy = [
      [
        'function:Box.<init>:occurrence:1:source:a',
        'function:Box.<init>:occurrence:1:maxControlNesting',
      ],
    ];

    expect(violations([nested('a')])).toEqual(legacy);
    expect(violations([quiet('q'), nested('a')])).toEqual(legacy);
    expect(violations([quiet('q'), quiet('r'), nested('a'), quiet('s')])).toEqual(legacy);
    expect(violations([nested('b'), nested('a')])).toEqual([
      [
        'function:Box.<init>:occurrence:1:source:b',
        'function:Box.<init>:occurrence:1:maxControlNesting',
      ],
      ...legacy,
    ]);
    expect(violations([nested('a'), nested('a')])).toEqual([
      ...legacy,
      [
        'function:Box.<init>:occurrence:2:source:a',
        'function:Box.<init>:occurrence:2:maxControlNesting',
      ],
    ]);
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
        path: 'a',
        identity: 'package-edge:a->b',
        message: 'a depends on less stable package b',
        classification: 'enforceable',
      },
    ]);
    expect(byRule(findings, 'stability-direction-metric')[0].metric).toEqual({
      name: 'instabilityDelta',
      value: expect.closeTo(0.4, 10),
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
      message:
        'Test runs no production code: nothing it imports or references, directly or through test helpers, is production code. Test the production code it is about, or delete the test',
    });
    expect(failures[1].identity).toMatch(/^test:test\/BT\.java:source:[0-9a-f]{24}$/);
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

describe('coupling metrics on a neutral dependency graph', () => {
  // ui -> core -> util; ui -> util (runtime); core -> ui (type only). Packages are the first path
  // segment.
  const modules = ['core/a', 'core/b', 'ui/x', 'util/u'];
  const edges = [
    { source: 'ui/x', target: 'core/a', kind: 'runtime' },
    { source: 'core/a', target: 'core/b', kind: 'runtime' },
    { source: 'core/b', target: 'util/u', kind: 'runtime' },
    { source: 'core/a', target: 'ui/x', kind: 'type-only' },
    { source: 'ui/x', target: 'util/u', kind: 'runtime' },
  ];
  const packageOf = (module) => module.split('/')[0];

  it('computes fan-in, fan-out and instability per module and per package', () => {
    const result = computeCoupling({ modules, edges, packageOf });
    expect(result.modules.find((entry) => entry.module === 'core/a')).toEqual({
      module: 'core/a',
      package: 'core',
      fanIn: 1,
      fanOut: 2,
      totalCoupling: 3,
      instability: expect.closeTo(0.6667, 10),
    });
    expect(result.packages.map((entry) => entry.name)).toEqual(['core', 'ui', 'util']);
    expect(result.packages[0]).toMatchObject({
      name: 'core',
      modules: 2,
      cohesion: { internalEdges: 1, edgeDensity: 0.5, connectedComponents: 1 },
    });
  });

  it('adds runtime-only variants only on request', () => {
    expect(computeCoupling({ modules, edges, packageOf }).modules[0]).not.toHaveProperty(
      'runtimeFanIn',
    );
    const runtime = computeCoupling({ modules, edges, packageOf, runtime: true });
    expect(runtime.modules.find((entry) => entry.module === 'core/a')).toMatchObject({
      runtimeFanIn: 1,
      runtimeFanOut: 1,
      runtimeInstability: 0.5,
    });
  });

  it('lists a package pair whose source is less stable than its target once', () => {
    const violatingModules = ['x/p', 'y/q', 'z/r', 's/a', 'v/b', 'v/d', 'w/c'];
    const runtime = (source, target) => ({ source, target, kind: 'runtime' });
    const result = computeCoupling({
      modules: violatingModules,
      edges: [
        runtime('x/p', 's/a'),
        runtime('y/q', 's/a'),
        runtime('z/r', 's/a'),
        runtime('s/a', 'v/b'),
        runtime('s/a', 'v/d'),
        runtime('v/b', 'w/c'),
        runtime('v/d', 'w/c'),
      ],
      packageOf,
    });
    const unit = (name, files) => ({
      unit: `package ${name}`,
      folders: [name],
      files,
      count: files.length,
    });
    expect(result.stabilityDirection).toEqual([
      {
        source: 's',
        target: 'v',
        sourceInstability: 0.4,
        targetInstability: 0.5,
        delta: 0.1,
        cause: {
          folders: ['s'],
          units: [
            unit('v', ['v/b', 'v/d']),
            unit('w', ['w/c']),
            unit('x', ['x/p']),
            unit('y', ['y/q']),
            unit('z', ['z/r']),
          ],
        },
      },
    ]);
  });

  it('reports no instability for an isolated module and handles an empty graph', () => {
    const lone = computeCoupling({ modules: ['a/x'], edges: [], packageOf });
    expect(lone.modules[0].instability).toBeNull();
    expect(lone.packages[0].cohesion.edgeDensity).toBeNull();
    expect(computeCoupling({ modules: [], edges: [], packageOf })).toEqual({
      modules: [],
      packages: [],
      stabilityDirection: [],
    });
  });
});
