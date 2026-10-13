import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readKotlinCrapFindings, readKotlinStructureFindings } from './kotlin-metrics.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const FILE = 'src/main/kotlin/demo/Boot.kt';

const SOURCE = `package demo

class Boot {
    init {
        if (flag()) {
            println("on")
        }
    }

    val table = run {
        if (flag()) 1 else 2
    }

    fun flag() = true
}
`;

function entry(name, start, end, extra = {}) {
  return {
    file: FILE,
    name,
    start,
    end,
    lines: end - start + 1,
    statements: 1,
    maxControlNesting: 0,
    parameters: 0,
    complexity: 1,
    inline: false,
    initializer: false,
    ...extra,
  };
}

const INIT = entry('Boot.<init#1>', 4, 8, { initializer: true, complexity: 2 });
const TABLE = entry('Boot.table', 10, 12, { initializer: true, complexity: 2 });
const FILES = [{ file: FILE, package: 'demo', classes: ['demo.Boot'] }];

function sourceLine(number, covered, missed, branches = [0, 0]) {
  return `<line nr="${number}" mi="${missed}" ci="${covered}" mb="${branches[0]}" cb="${branches[1]}"/>`;
}

function jacoco(sourceLines, methods = '') {
  return `<report name="demo"><package name="demo">
  <class name="demo/Boot" sourcefilename="Boot.kt">
    <method name="&lt;init&gt;" desc="()V" line="3"><counter type="LINE" missed="0" covered="9"/></method>
    ${methods}
  </class>
  <sourcefile name="Boot.kt">${sourceLines.join('')}</sourcefile>
</package></report>`;
}

function crap(functions, report, crapLimit = 3) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-initializers-'));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, 'src/main/kotlin/demo'), { recursive: true });
  writeFileSync(path.join(root, FILE), SOURCE);
  return readKotlinCrapFindings(
    { functions, files: FILES },
    { projectRoot: root, jacoco: report, crapLimit },
  ).map(({ rule, symbol, message }) => `${rule} ${symbol}: ${message}`);
}

const COVERED = [
  sourceLine(4, 1, 0),
  sourceLine(5, 2, 0, [0, 2]),
  sourceLine(6, 1, 0),
  sourceLine(10, 1, 0),
  sourceLine(11, 2, 0, [0, 2]),
];

describe('CRAP of init blocks and property initializers', () => {
  it('passes initializers whose source lines and branches are covered', () => {
    expect(crap([INIT, TABLE], jacoco(COVERED))).toEqual([]);
  });

  it('scores an init block over the coverage of its own lines, whatever method holds them', () => {
    const missed = [
      sourceLine(4, 1, 0),
      sourceLine(5, 0, 2, [2, 0]),
      sourceLine(6, 0, 1),
      sourceLine(10, 1, 0),
      sourceLine(11, 2, 0, [0, 2]),
    ];

    expect(crap([INIT, TABLE], jacoco(missed))).toEqual([
      'crap-score-limit Boot.<init#1>: Boot.<init#1> has CRAP 6.00; score must be below 3. Test its uncovered branches, or split a branchy part into its own function.',
    ]);
  });

  it('scores a property initializer by its untaken branches', () => {
    const untaken = [...COVERED.slice(0, 4), sourceLine(11, 2, 0, [2, 0])];

    expect(crap([INIT, TABLE], jacoco(untaken))).toEqual([
      'crap-score-limit Boot.table: Boot.table has CRAP 6.00; score must be below 3. Test its uncovered branches, or split a branchy part into its own function.',
    ]);
  });

  it('reports unknown coverage for an initializer whose lines JaCoCo does not list', () => {
    expect(crap([INIT, TABLE], jacoco([sourceLine(10, 1, 0), sourceLine(11, 2, 0)]))).toEqual([
      'crap-coverage-unknown Boot.<init#1>: Boot.<init#1> has unknown coverage and no CRAP score: no test runs it. Add a test that calls it.',
    ]);
  });

  it('leaves the lines of a unit nested inside an initializer to that unit', () => {
    const inner = entry('Boot.Inner.run', 5, 7, { complexity: 2 });
    const lines = [
      sourceLine(4, 1, 0),
      sourceLine(5, 0, 1),
      sourceLine(6, 0, 1),
      sourceLine(7, 0, 1),
      sourceLine(10, 1, 0),
      sourceLine(11, 2, 0, [0, 2]),
    ];
    const method =
      '<method name="run" desc="()V" line="5"><counter type="LINE" missed="3" covered="0"/></method>';

    expect(crap([INIT, inner, TABLE], jacoco(lines, method))).toEqual([
      'crap-score-limit Boot.Inner.run: Boot.Inner.run has CRAP 6.00; score must be below 3. Test its uncovered branches, or split a branchy part into its own function.',
    ]);
  });

  it('still measures a lambda-valued property through its lambda method', () => {
    const lambda = entry('Boot.handler', 10, 12);
    const method =
      '<method name="handler$lambda$0" desc="()V" line="11"><counter type="LINE" missed="0" covered="2"/></method>';

    expect(crap([lambda], jacoco([], method))).toEqual([]);
  });
});

describe('structure limits of init blocks and property initializers', () => {
  it('measures an init block like a function and names it after its class', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-initializers-'));
    temporaryRoots.push(root);
    mkdirSync(path.join(root, 'src/main/kotlin/demo'), { recursive: true });
    writeFileSync(path.join(root, FILE), SOURCE);
    const wide = entry('Boot.<init#2>', 4, 90, { initializer: true, statements: 25 });

    const findings = readKotlinStructureFindings({ functions: [wide], files: FILES }, root);

    expect(findings.map(({ rule, symbol, message }) => ({ rule, symbol, message }))).toEqual([
      {
        rule: 'function-lines-limit',
        symbol: 'Boot.<init#2>',
        message: 'Boot.<init#2> has 87 lines; limit is 50',
      },
      {
        rule: 'function-statements-limit',
        symbol: 'Boot.<init#2>',
        message:
          'Boot.<init#2> has 25 statements; limit is 15. Split by responsibility and name each part for what it checks or does.',
      },
    ]);
  });
});
