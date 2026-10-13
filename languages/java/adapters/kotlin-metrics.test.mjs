import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import {
  kotlinModules,
  readKotlinCrapFindings,
  readKotlinMetrics,
  readKotlinStructureFindings,
  selectKotlinMethods,
} from './kotlin-metrics.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const SOURCE = `package demo

fun tier(value: Int, step: Int = 10): String {
    if (value > step * 3) {
        return "high"
    }
    return "low"
}

class Counter(private val start: Int) {
    val doubled: Int
        get() = start * 2

    fun wide(a: Int, b: Int, c: Int, d: Int): Int {
        val values = listOf(a, b, c, d).map { v -> if (v > 1) v else a }
        return values.sum()
    }
}
`;

const METRICS = {
  functions: [
    entry({
      name: 'tier',
      start: 3,
      end: 8,
      complexity: 2,
      statements: 3,
      nesting: 1,
      parameters: 2,
    }),
    entry({ name: 'Counter.doubled.get', start: 12, end: 12 }),
    entry({ name: 'Counter.wide', start: 14, end: 17, complexity: 2, parameters: 4 }),
  ],
  files: [
    {
      file: 'src/main/kotlin/demo/Tiers.kt',
      package: 'demo',
      classes: ['demo.TiersKt', 'demo.Counter'],
    },
  ],
};

function entry({ name, start, end, complexity = 1, statements = 1, nesting = 0, parameters = 0 }) {
  return {
    file: 'src/main/kotlin/demo/Tiers.kt',
    name,
    start,
    end,
    lines: end - start + 1,
    statements,
    maxControlNesting: nesting,
    parameters,
    complexity,
  };
}

function project(metrics = METRICS) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-metrics-'));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, 'src/main/kotlin/demo'), { recursive: true });
  writeFileSync(path.join(root, 'src/main/kotlin/demo/Tiers.kt'), SOURCE);
  mkdirSync(path.join(root, 'build/nitpicker'), { recursive: true });
  writeFileSync(path.join(root, 'build/nitpicker/kotlin-metrics.json'), JSON.stringify(metrics));
  return { root, reportRoot: path.join(root, 'build/nitpicker') };
}

const jacoco = (counters, shift = 0) => `<report name="demo"><package name="demo">
  <class name="demo/TiersKt" sourcefilename="Tiers.kt">
    <method name="tier" desc="(II)Ljava/lang/String;" line="${3 + shift}">${counters.tier}</method>
    <method name="tier$default" desc="(IIILjava/lang/Object;)Ljava/lang/String;" line="${3 + shift}">
      <counter type="LINE" missed="1" covered="0"/>
    </method>
  </class>
  <class name="demo/Counter" sourcefilename="Tiers.kt">
    <method name="getDoubled" desc="()I" line="${12 + shift}">${counters.doubled}</method>
    <method name="wide" desc="(IIII)I" line="${14 + shift}">${counters.wide}</method>
    <method name="wide$lambda$0" desc="(III)I" line="${15 + shift}">${counters.lambda}</method>
  </class>
</package></report>`;

const lines = (covered, missed) => `<counter type="LINE" missed="${missed}" covered="${covered}"/>`;
const FULL = {
  tier: lines(5, 0),
  doubled: lines(1, 0),
  wide: lines(2, 0),
  lambda: lines(1, 0),
};

function crap(counters, extra = {}) {
  const { root, reportRoot } = project();
  return readKotlinCrapFindings(readKotlinMetrics(reportRoot), {
    projectRoot: root,
    jacoco: jacoco(counters),
    ...extra,
  });
}

describe('readKotlinMetrics', () => {
  it('is empty when the report is missing', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-metrics-'));
    temporaryRoots.push(root);

    expect(readKotlinMetrics(root)).toEqual({ functions: [], files: [] });
  });
});

describe('readKotlinStructureFindings', () => {
  it('reports only the functions over a limit, with the shared rule ids and messages', () => {
    const { root, reportRoot } = project();

    const findings = readKotlinStructureFindings(readKotlinMetrics(reportRoot), root);

    expect(findings.map(({ rule, symbol, message }) => ({ rule, symbol, message }))).toEqual([
      {
        rule: 'function-parameters-limit',
        symbol: 'Counter.wide',
        message: 'Counter.wide has 4 parameters; limit is 3',
      },
    ]);
    expect(
      findings.map(({ tool, path: file, classification, location }) => ({
        tool,
        path: file,
        classification,
        location,
      })),
    ).toEqual([
      {
        tool: 'structure',
        path: 'src/main/kotlin/demo/Tiers.kt',
        classification: 'enforceable',
        location: { line: 14 },
      },
    ]);
    expect(() => parseAnalyzerReport({ findings }, 'kotlin')).not.toThrow();
  });

  it('reports each limit with its own rule and the nesting message', () => {
    const { root } = project();
    const wide = {
      ...entry({ name: 'big', start: 3, end: 60, statements: 16, nesting: 3, parameters: 4 }),
    };

    const rules = readKotlinStructureFindings({ functions: [wide], files: [] }, root).map(
      ({ rule }) => rule,
    );

    expect(rules).toEqual([
      'function-lines-limit',
      'function-statements-limit',
      'function-control-nesting-limit',
      'function-parameters-limit',
    ]);
  });

  it('keeps the identity when the function only moves, and changes it when its text changes', () => {
    const { root } = project();
    const identityAt = (start, end) =>
      readKotlinStructureFindings(
        { functions: [entry({ name: 'Counter.wide', start, end, parameters: 4 })], files: [] },
        root,
      )[0].identity;
    const before = identityAt(14, 17);
    writeFileSync(path.join(root, 'src/main/kotlin/demo/Tiers.kt'), `\n\n${SOURCE}`);

    expect(identityAt(16, 19)).toBe(before);
    expect(identityAt(16, 18)).not.toBe(before);
  });
});

describe('selectKotlinMethods', () => {
  const fn = { start: 10, end: 20 };
  const method = (name, line) => ({ name, line });

  it('takes the methods that start inside the function, lambdas included', () => {
    const selected = selectKotlinMethods(
      fn,
      [method('run', 10), method('run$lambda$0', 15), method('other', 21), method('before', 9)],
      [fn],
    );

    expect(selected.map(({ name }) => name)).toEqual(['run', 'run$lambda$0']);
  });

  it('leaves out the synthetic default-argument bridge', () => {
    const selected = selectKotlinMethods(fn, [method('run', 10), method('run$default', 10)], [fn]);

    expect(selected.map(({ name }) => name)).toEqual(['run']);
  });

  it('counts a static bridge of a companion function once, through the method that holds the code', () => {
    const bridge = { name: 'make', line: 12, className: 'demo/Holder' };
    const body = { name: 'make', line: 12, className: 'demo/Holder$Companion' };

    expect(selectKotlinMethods(fn, [bridge, body], [fn])).toEqual([body]);
    expect(
      selectKotlinMethods(fn, [bridge, { ...bridge, name: 'other' }, body], [fn]).map(
        ({ name }) => name,
      ),
    ).toEqual(['other', 'make']);
  });

  it('keeps the overloads a function has in one class', () => {
    const overloads = [
      { name: 'over', line: 11, className: 'demo/EdgeKt' },
      { name: 'over', line: 11, className: 'demo/EdgeKt' },
    ];

    expect(selectKotlinMethods(fn, overloads, [fn])).toEqual(overloads);
  });

  it('leaves the methods of a function nested inside to that function', () => {
    const inner = { start: 14, end: 16 };

    expect(
      selectKotlinMethods(fn, [method('outer', 10), method('inner', 14)], [fn, inner]).map(
        ({ name }) => name,
      ),
    ).toEqual(['outer']);
    expect(selectKotlinMethods(inner, [method('inner', 14)], [fn, inner])).toHaveLength(1);
  });
});

describe('readKotlinCrapFindings', () => {
  it('passes covered functions, whatever class holds them: file facade, class, accessor, lambda', () => {
    expect(crap(FULL)).toEqual([]);
  });

  it('computes the score over the function and its lambda, not over its default-argument bridge', () => {
    const findings = crap({ ...FULL, tier: lines(0, 5) }, { crapLimit: 6 });

    expect(
      findings.map(({ tool, rule, symbol, message, path: file }) => ({
        tool,
        rule,
        symbol,
        message,
        path: file,
      })),
    ).toEqual([
      {
        tool: 'crap',
        rule: 'crap-score-limit',
        symbol: 'tier',
        message:
          'tier has CRAP 6.00; score must be below 6. Test its uncovered branches, or split a branchy part into its own function.',
        path: 'src/main/kotlin/demo/Tiers.kt',
      },
    ]);
  });

  it('counts the lines of a lambda towards the function that holds it', () => {
    const covered = crap({ ...FULL, lambda: lines(0, 1) }, { crapLimit: 2.1 });

    expect(covered.map(({ symbol }) => symbol)).toEqual(['Counter.wide']);
    expect(covered[0].message).toBe(
      'Counter.wide has CRAP 2.15; score must be below 2.1. Test its uncovered branches, or split a branchy part into its own function.',
    );
  });

  it('leaves out inline functions: JaCoCo never sees their body run', () => {
    const { root, reportRoot } = project();
    const metrics = readKotlinMetrics(reportRoot);
    const inline = {
      ...metrics,
      functions: metrics.functions.map((fn) => ({ ...fn, inline: fn.name === 'tier' })),
    };

    const findings = readKotlinCrapFindings(inline, {
      projectRoot: root,
      jacoco: '<report name="demo"></report>',
    });

    expect(findings.map(({ symbol }) => symbol)).toEqual(['Counter.doubled.get', 'Counter.wide']);
  });

  it('reports a function no JaCoCo method belongs to as unknown coverage', () => {
    const { root, reportRoot } = project();

    const findings = readKotlinCrapFindings(readKotlinMetrics(reportRoot), {
      projectRoot: root,
      jacoco: '<report name="demo"></report>',
    });

    expect(findings.map(({ rule, symbol }) => `${rule} ${symbol}`)).toEqual([
      'crap-coverage-unknown tier',
      'crap-coverage-unknown Counter.doubled.get',
      'crap-coverage-unknown Counter.wide',
    ]);
    expect(findings.every(({ classification }) => classification === 'enforceable')).toBe(true);
    expect(findings[0].message).toBe(
      'tier has unknown coverage and no CRAP score: no test runs it. Add a test that calls it.',
    );
  });

  it('finds the coverage of a file whose directory is not its package', () => {
    const { root } = project();
    mkdirSync(path.join(root, 'src/main/kotlin'), { recursive: true });
    writeFileSync(path.join(root, 'src/main/kotlin/Flat.kt'), 'package demo\n\nfun flat() = 1\n');
    const flat = {
      functions: [
        { ...entry({ name: 'flat', start: 3, end: 3 }), file: 'src/main/kotlin/Flat.kt' },
      ],
      files: [{ file: 'src/main/kotlin/Flat.kt', package: 'demo', classes: ['demo.FlatKt'] }],
    };
    const report = (counters) => `<report name="demo"><package name="demo">
  <class name="demo/FlatKt" sourcefilename="Flat.kt">
    <method name="flat" desc="()I" line="3">${counters}</method>
  </class>
</package></report>`;
    const run = (counters) =>
      readKotlinCrapFindings(flat, { projectRoot: root, jacoco: report(counters), crapLimit: 2 });

    expect(run(lines(1, 0))).toEqual([]);
    expect(run(lines(0, 1)).map(({ rule, symbol }) => `${rule} ${symbol}`)).toEqual([
      'crap-score-limit flat',
    ]);
  });

  it('finds the coverage of a file in the root package', () => {
    const { root } = project();
    writeFileSync(path.join(root, 'src/main/kotlin/Root.kt'), 'fun root() = 1\n');
    const rootPackage = {
      functions: [
        { ...entry({ name: 'root', start: 1, end: 1 }), file: 'src/main/kotlin/Root.kt' },
      ],
      files: [{ file: 'src/main/kotlin/Root.kt', package: '', classes: ['RootKt'] }],
    };
    const jacocoReport = `<report name="demo"><package name="">
  <class name="RootKt" sourcefilename="Root.kt">
    <method name="root" desc="()I" line="1">${lines(1, 0)}</method>
  </class>
</package></report>`;

    expect(
      readKotlinCrapFindings(rootPackage, { projectRoot: root, jacoco: jacocoReport }),
    ).toEqual([]);
  });

  it('keeps the identity of an over-limit function when it only moves, and ratchets its score', () => {
    const { root, reportRoot } = project();
    const run = (metrics, shift = 0) =>
      readKotlinCrapFindings(metrics, {
        projectRoot: root,
        jacoco: jacoco({ ...FULL, tier: lines(0, 5) }, shift),
        crapLimit: 2,
      }).find(({ symbol }) => symbol === 'tier');
    const base = run(readKotlinMetrics(reportRoot));
    writeFileSync(path.join(root, 'src/main/kotlin/demo/Tiers.kt'), `\n\n${SOURCE}`);

    const moved = run(
      {
        ...METRICS,
        functions: METRICS.functions.map((fn) => ({ ...fn, start: fn.start + 2, end: fn.end + 2 })),
      },
      2,
    );

    expect(moved.identity).toBe(base.identity);
    expect(moved.location).toEqual({ line: 5 });
    expect({ key: base.ratchet.key, value: base.ratchet.value }).toEqual({
      key: 'function:tier:crap',
      value: 6,
    });
  });
});

describe('kotlinModules', () => {
  it('maps every class of a file, facade included, to one module named after the first class', () => {
    const { moduleOf, fileOf } = kotlinModules(METRICS);

    expect(moduleOf.get('demo.TiersKt')).toBe('demo.Counter');
    expect(moduleOf.get('demo.Counter')).toBe('demo.Counter');
    expect(fileOf.get('demo.Counter')).toBe('src/main/kotlin/demo/Tiers.kt');
  });

  it('has no module for a file without classes', () => {
    expect(kotlinModules({ functions: [], files: [{ file: 'a.kt', classes: [] }] })).toEqual({
      moduleOf: new Map(),
      fileOf: new Map(),
    });
  });
});
