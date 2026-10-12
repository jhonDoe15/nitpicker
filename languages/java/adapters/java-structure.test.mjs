import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RULE_IDS } from '../../../shared/policy.mjs';
import { readJavaFileLimitFindings, readJavaStructureFindings } from './java-structure.mjs';

const FILE = 'src/main/java/demo/Big.java';
const SOURCE = ['class Big {', '  int big(int a) {', '    return a;', '  }', '}', ''].join('\n');

let projectRoot;
let reportRoot;

const method = (overrides = {}) => ({
  file: FILE,
  name: 'Big.big',
  start: 2,
  end: 4,
  lines: 3,
  statements: 1,
  maxControlNesting: 0,
  parameters: 1,
  ...overrides,
});

function readWith(entries, source = SOURCE) {
  writeFileSync(path.join(projectRoot, FILE), source);
  writeFileSync(path.join(reportRoot, 'structure.json'), JSON.stringify(entries));
  return readJavaStructureFindings(reportRoot, projectRoot);
}

describe('Java structure findings', () => {
  beforeEach(() => {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-structure-'));
    reportRoot = path.join(projectRoot, 'build/nitpicker');
    mkdirSync(reportRoot, { recursive: true });
    mkdirSync(path.join(projectRoot, path.dirname(FILE)), { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('reports nothing without a report and for methods within the limits', () => {
    expect(readJavaStructureFindings(reportRoot, projectRoot)).toEqual([]);
    expect(
      readWith([method({ lines: 50, statements: 15, maxControlNesting: 2, parameters: 3 })]),
    ).toEqual([]);
  });

  it('fails each metric over its limit with the TypeScript rule ids and messages', () => {
    const findings = readWith([
      method({ lines: 51, statements: 16, maxControlNesting: 3, parameters: 4 }),
    ]);

    expect(
      findings.map(({ rule, message, classification, tool }) => [
        rule,
        message,
        classification,
        tool,
      ]),
    ).toEqual([
      [RULE_IDS.functionLines, 'Big.big has 51 lines; limit is 50', 'enforceable', 'structure'],
      [
        RULE_IDS.functionStatements,
        'Big.big has 16 statements; limit is 15. Split by responsibility and name each part for what it checks or does.',
        'enforceable',
        'structure',
      ],
      [
        RULE_IDS.functionControlNesting,
        'Big.big nests control flow 3 deep (limit 2). Return early instead of nesting.',
        'enforceable',
        'structure',
      ],
      [
        RULE_IDS.functionParameters,
        'Big.big has 4 parameters; limit is 3',
        'enforceable',
        'structure',
      ],
    ]);
    expect(findings[0]).toMatchObject({ path: FILE, symbol: 'Big.big', location: { line: 2 } });
  });

  it('keeps the identity when the method moves or is re-indented, and changes it when edited', () => {
    const entry = method({ parameters: 4 });
    const identity = (source, shifted = {}) =>
      readWith([{ ...entry, ...shifted }], source)[0].identity;
    const original = identity(SOURCE);

    const moved = ['// moved', '', ...SOURCE.split('\n')].join('\n');
    expect(identity(moved, { start: 4, end: 6 })).toBe(original);
    expect(identity(SOURCE.replace('  int big', '      int big'))).toBe(original);
    expect(identity(SOURCE.replace('return a;', 'return a + 1;'))).not.toBe(original);
  });

  it('numbers methods of the same name in one file', () => {
    const second = method({ start: 6, end: 8, parameters: 5 });
    const source = [
      'class Big {',
      '  int big(int a) {',
      '    return a;',
      '  }',
      '',
      '  int big() {',
      '    return 1;',
      '  }',
      '}',
    ].join('\n');
    const identities = readWith([method({ parameters: 4 }), second], source).map((f) => f.identity);

    expect(identities[0]).toContain(':occurrence:1:');
    expect(identities[1]).toContain(':occurrence:2:');
  });
});

describe('Java file limits', () => {
  const manifest = { sourceRoots: ['src/main/java'], testSourceRoots: ['src/test/java'] };

  function writeClasses(folder, count, text = 'class A {}\n') {
    mkdirSync(path.join(projectRoot, folder), { recursive: true });
    for (const index of Array.from({ length: count }, (_, position) => position)) {
      writeFileSync(path.join(projectRoot, folder, `C${String(index)}.java`), text);
    }
  }

  function summary(findings) {
    return findings.map(({ rule, path: findingPath, identity, tool }) => [
      rule,
      findingPath,
      identity,
      tool,
    ]);
  }

  beforeEach(() => {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-file-limits-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('counts main and test classes per package and leaves line length to Checkstyle', () => {
    writeClasses('src/main/java/demo', 7, `class A { ${'int a; '.repeat(40)}}\n`);
    writeClasses('src/test/java/demo', 6);
    writeFileSync(path.join(projectRoot, 'src/main/java/demo/notes.txt'), 'not code\n');

    expect(summary(readJavaFileLimitFindings(projectRoot, { manifest }))).toEqual([
      [RULE_IDS.folderFiles, 'src/main/java/demo', 'folder-files:source:7', 'structure'],
    ]);
  });

  it('applies the configured thresholds, exceptions and exclude globs', () => {
    writeClasses('src/main/java/demo', 3, 'a\nb\nc\n');
    writeClasses('src/main/java/gen', 3);
    writeClasses('src/test/java/demo', 3);

    const findings = readJavaFileLimitFindings(projectRoot, {
      manifest,
      fileLimits: {
        thresholds: { fileLines: 2, folderFiles: 2 },
        exceptions: [{ rule: 'folder-files-limit', paths: ['src/test/java/**'] }],
      },
      exclude: ['src/main/java/gen/**'],
    });

    expect(summary(findings).map(([rule, findingPath]) => [rule, findingPath])).toEqual([
      [RULE_IDS.fileLines, 'src/main/java/demo/C0.java'],
      [RULE_IDS.fileLines, 'src/main/java/demo/C1.java'],
      [RULE_IDS.fileLines, 'src/main/java/demo/C2.java'],
      [RULE_IDS.folderFiles, 'src/main/java/demo'],
    ]);
  });

  it('skips source roots that do not exist', () => {
    expect(readJavaFileLimitFindings(projectRoot, { manifest })).toEqual([]);
  });
});
