import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ingest,
  positionAt,
  rulesetMessage,
  sarifResult,
  sourceProjectMaker,
} from './__tests__/sarif-fixtures.mts';
import type { Ingested, SarifResult } from './__tests__/sarif-fixtures.mts';
import { LOAD_EFFECT_RULE, shortCall, withLoadEffectSubjects } from './load-effects.mts';

const RULESET = path.resolve(import.meta.dirname, '../gradle/pmd-main-ruleset.xml');
const FILE = 'src/main/java/shop/Db.java';
const SOURCE = `package shop;

enum Mode {
  FAST {
    final boolean ok = Files.exists(Path.of("a"));
  },
  SLOW;
}

final class Db {
  static final Connection DB = connect("jdbc:h2:mem:a;MODE=(x)");
  static {
    Files.exists(Path.of("seed"));
  }

  static Connection connect(String url) {
    return DriverManager.getConnection(url);
  }
}
`;

const project = sourceProjectMaker('nitpicker-load-effects-', FILE);

function at(source: string, snippet: string): { line: number; column: number } {
  return positionAt(source, source.indexOf(snippet));
}

function result(
  source: string,
  snippet: string,
  overrides: Partial<SarifResult> = {},
): SarifResult {
  const ruleId = LOAD_EFFECT_RULE;
  const text = rulesetMessage(RULESET, ruleId) ?? '';
  return { ...sarifResult({ ruleId, text, file: FILE }, at(source, snippet)), ...overrides };
}

function findings(root: string, results: SarifResult[]): Ingested[] {
  const log = { version: '2.1.0', runs: [{ tool: { driver: { name: 'PMD' } }, results }] };
  return ingest(withLoadEffectSubjects(log, { projectRoot: root }), { tool: 'pmd' }).findings;
}

function evidence(message: string): string | undefined {
  return /holder class: (.*), so it connects/u.exec(message)?.[1];
}

describe('class-load effect findings in Java', () => {
  it('name the call, the class that loads and the member that runs it', () => {
    const root = project(SOURCE);
    const named = findings(root, [
      result(SOURCE, 'Files.exists(Path.of("a"))'),
      result(SOURCE, 'Files.exists(Path.of("seed"))'),
      result(SOURCE, 'DriverManager.getConnection(url)'),
    ]);

    expect(named.map(({ message }) => evidence(message))).toEqual([
      '`Files.exists(...)` runs while Mode loads (in enum constant FAST)',
      '`Files.exists(...)` runs while Db loads (in a static block)',
      '`DriverManager.getConnection(...)` runs while Db loads (in method connect, which static field DB calls)',
    ]);
    expect(named.map(({ identity }) => identity)).toEqual([
      'fp:nitpicker/subject=Mode.FAST: Files.exists(...)',
      'fp:nitpicker/subject=Db.static {}: Files.exists(...)',
      'fp:nitpicker/subject=Db.connect(): DriverManager.getConnection(...)',
    ]);
  });

  it('keep each identity when lines move, and give a replaced call a new one', () => {
    const head = SOURCE.replace(
      'final class Db {\n',
      'final class Db {\n  static final int SIZE = 3;\n',
    ).replace('Files.exists(Path.of("seed"));', 'Files.delete(Path.of("seed"));');
    const base = findings(project(SOURCE), [
      result(SOURCE, 'Files.exists(Path.of("a"))'),
      result(SOURCE, 'Files.exists(Path.of("seed"))'),
      result(SOURCE, 'DriverManager.getConnection(url)'),
    ]).map(({ identity }) => identity);
    const after = findings(project(head), [
      result(head, 'Files.exists(Path.of("a"))'),
      result(head, 'Files.delete(Path.of("seed"))'),
      result(head, 'DriverManager.getConnection(url)'),
    ]).map(({ identity }) => identity);

    expect(after.filter((identity) => !base.includes(identity))).toEqual([
      'fp:nitpicker/subject=Db.static {}: Files.delete(...)',
    ]);
    expect(base.filter((identity) => !after.includes(identity))).toEqual([
      'fp:nitpicker/subject=Db.static {}: Files.exists(...)',
    ]);
  });

  it('leave other rules and unreadable sources as PMD wrote them', () => {
    const root = project(SOURCE);
    const other = result(SOURCE, 'Files.exists(Path.of("a"))', {
      ruleId: 'StaticForwardingWrapper',
    });
    const gone = result(SOURCE, 'Files.exists(Path.of("a"))', {
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: 'src/main/java/shop/Gone.java' },
            region: { startLine: 1, startColumn: 1 },
          },
        },
      ],
    });
    const log = { version: '2.1.0', runs: [{ results: [other, gone] }] };

    expect(withLoadEffectSubjects(log, { projectRoot: root })).toEqual(log);
    expect(withLoadEffectSubjects(log, { projectRoot: undefined })).toEqual(log);
  });
});

describe('shortCall', () => {
  it('collapses arguments and lambdas, joins a chain split over lines and shortens a long chain', () => {
    expect(shortCall('CoroutineScope(Dispatchers.IO)\n    .launch { poll() }')).toBe(
      'CoroutineScope(...).launch {...}',
    );
    expect(shortCall(`a.${'b().'.repeat(40)}c()`)).toHaveLength(103);
  });
});
