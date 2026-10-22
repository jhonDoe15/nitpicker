import { describe, expect, it } from 'vitest';
import { evaluateBaselineExpansions } from './baseline-expansion.mjs';
import { branchCoverageFindings } from './branch-coverage.mjs';
import { computeCoupling, evaluateCoupling } from './coupling.mjs';
import { crapFindings } from './crap.mjs';
import { clonePartnerPath, evaluateDuplicates } from './duplicates.mjs';
import { mutantFindings } from './mutation.mjs';
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
      [
        'a.java',
        'This code repeats b.java:3 (6 lines). Keep one copy and call it from both places. If the repetition is intended, add a.java or b.java to "exclude" in nitpicker.config.json.',
      ],
      [
        'a.java',
        'This code repeats b.java:8 (6 lines). Keep one copy and call it from both places. If the repetition is intended, add a.java or b.java to "exclude" in nitpicker.config.json.',
      ],
    ]);
    expect(failures[0].identity).toMatch(
      /^pair:a\.java\|b\.java:fragment:[0-9a-f]{24}:occurrence:1$/,
    );
    expect(failures[1].identity).toMatch(/:occurrence:2$/);
    expect(failures[0].location).toEqual({ line: 8 });
  });

  it('names the file once when a file repeats itself', () => {
    const [failure] = byRule(
      evaluateDuplicates([clone('a.java', 'a.java')], 'duplicates'),
      'duplicate-clone',
    );
    expect(failure.message).toBe(
      'This code repeats a.java:8 (6 lines). Keep one copy and call it from both places. If the repetition is intended, add a.java to "exclude" in nitpicker.config.json.',
    );
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

describe('crapFindings', () => {
  const fn = { path: 'a.ts', name: 'f', identity: 'function:f', line: 3 };

  it('fails at or above the limit and passes below it', () => {
    const findings = crapFindings(
      [
        { ...fn, crap: 9 },
        { ...fn, identity: 'low', crap: 8.99 },
      ],
      { tool: 'crap' },
    );
    expect(findings).toEqual([
      {
        tool: 'crap',
        rule: 'crap-score-limit',
        path: 'a.ts',
        identity: 'function:f',
        message:
          'f has CRAP 9.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function. If this is intended, add {"rule":"crap-score-limit","paths":["a.ts"],"function":"f","reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        symbol: 'f',
        location: { line: 3 },
      },
    ]);
  });

  it('names the exception entry in the unknown-coverage and ratchet messages', () => {
    const [unknown] = crapFindings([{ ...fn, line: undefined }], {
      tool: 'crap',
    });
    expect(unknown.message).toBe(
      'f has unknown coverage and no CRAP score: no test runs it. Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that. If this is intended, add {"rule":"crap-coverage-unknown","paths":["a.ts"],"function":"f","reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
    const [ratcheted] = crapFindings([{ ...fn, ratchetKey: 'f:crap', crap: 12 }], { tool: 'crap' });
    expect(ratcheted.ratchet.worseMessage).toBe(
      'f CRAP rose from {base} to 12 (limit 9). Put new code in a new function and cover it with tests. If this is intended, add {"rule":"crap-score-limit","paths":["a.ts"],"function":"f","reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('reports unknown coverage when there is no finite score', () => {
    const findings = crapFindings([{ ...fn, line: undefined }], { tool: 'crap', limit: 5 });
    expect(findings).toEqual([
      expect.objectContaining({
        rule: 'crap-coverage-unknown',
        message: expect.stringContaining(
          'f has unknown coverage and no CRAP score: no test runs it',
        ),
        symbol: 'f',
      }),
    ]);
    expect(findings[0]).not.toHaveProperty('location');
  });
});

describe('branchCoverageFindings', () => {
  const identify = (key, occurrence) => `${key}:${String(occurrence)}`;

  it('numbers only the failing branches that share a key', () => {
    const findings = branchCoverageFindings(
      [
        { path: 'a', key: 'k', percent: 50, line: 1 },
        { path: 'a', key: 'k', percent: 100, line: 2 },
        { path: 'a', key: 'k', percent: 0, line: 3 },
        { path: 'b', key: 'k', percent: 94.9 },
      ],
      { tool: 'cov', identify },
    );
    expect(findings.map((finding) => finding.identity)).toEqual(['k:1', 'k:2', 'k:1']);
    expect(findings[0]).toMatchObject({
      rule: 'changed-branch-coverage',
      message:
        'Branch coverage is 50.00%; minimum is 95%. To accept the file, add it to "exclude" in nitpicker.config.json.',
      classification: 'enforceable',
      location: { line: 1 },
    });
    expect(findings[2]).not.toHaveProperty('location');
  });

  it('names the per-function exception when the branch knows its function', () => {
    const [finding] = branchCoverageFindings(
      [{ path: 'src/a.py', key: 'k', percent: 50, symbol: 'Store.save', arms: ['the exit'] }],
      { tool: 'cov', identify },
    );
    expect(finding.message).toBe(
      'Branch coverage is 50.00%; minimum is 95%. Not taken: the exit. Test it, or remove it if it can\'t happen. If this is intended, add {"rule":"changed-branch-coverage","paths":["src/a.py"],"function":"Store.save","reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
    expect(finding.symbol).toBe('Store.save');
  });

  it('passes a branch at the minimum', () => {
    expect(
      branchCoverageFindings([{ path: 'a', key: 'k', percent: 95 }], { tool: 'cov', identify }),
    ).toEqual([]);
  });
});

describe('mutantFindings', () => {
  it('enforces survived and uncovered mutants only', () => {
    const findings = mutantFindings(
      [
        { path: 'a', identity: '1', status: 'Survived', label: 'Op', line: 4, symbol: 'C#m' },
        { path: 'a', identity: '2', status: 'NoCoverage', label: 'Op' },
        { path: 'a', identity: '3', status: 'Timeout', label: 'Op' },
      ],
      { tool: 'mut' },
    );
    expect(findings.map((finding) => [finding.rule, finding.classification])).toEqual([
      ['mutant-survived', 'enforceable'],
      ['mutant-nocoverage', 'enforceable'],
      ['mutant-timeout', 'descriptive'],
    ]);
    expect(findings[0]).toMatchObject({
      message:
        'Survived Op: no test fails when this code changes. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
      symbol: 'C#m',
      location: { line: 4 },
    });
    expect(findings[1]).not.toHaveProperty('location');
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
      instability: 0.6667,
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
    const result = computeCoupling({ modules, edges, packageOf });
    for (const entry of result.stabilityDirection) {
      const source = result.packages.find((item) => item.name === entry.source);
      const target = result.packages.find((item) => item.name === entry.target);
      expect(source.instability).toBeLessThan(target.instability);
      expect(entry.delta).toBeGreaterThan(0);
    }
    const keys = result.stabilityDirection.map((entry) => `${entry.source}>${entry.target}`);
    expect(new Set(keys).size).toBe(keys.length);
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

describe('clonePartnerPath', () => {
  it('names the other file of the pair for a clone and its size metrics', () => {
    const findings = evaluateDuplicates(
      [
        {
          first: { file: 'b|c:d.java', line: 8 },
          second: { file: 'a.java', line: 3 },
          fragment: 'x',
          lines: 6,
          tokens: 60,
        },
      ],
      'duplicates',
    );

    expect(findings.map((finding) => [finding.path, clonePartnerPath(finding)])).toEqual([
      ['a.java', 'b|c:d.java'],
      ['a.java', 'b|c:d.java'],
      ['a.java', 'b|c:d.java'],
    ]);
  });

  it('has no partner for other findings', () => {
    expect(
      clonePartnerPath({ rule: 'duplicate-clone', path: 'a.java', identity: 'something' }),
    ).toBeUndefined();
    expect(
      clonePartnerPath({
        rule: 'other',
        path: 'a.java',
        identity: 'pair:a.java|b.java:fragment:x',
      }),
    ).toBeUndefined();
    expect(
      clonePartnerPath({ rule: 'duplicate-clone', path: 'a.java', identity: 'pair:a.java|b.java' }),
    ).toBeUndefined();
  });
});
