import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RULE_IDS } from '../../../../shared/policy.mjs';
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
    expect(findings[0]).toEqual({
      tool: 'structure',
      rule: 'function-lines-limit',
      path: FILE,
      identity: 'function:Big.big:occurrence:1:source:796ab01f9eb19cf455b6cda2',
      message: 'Big.big has 51 lines; limit is 50',
      classification: 'enforceable',
      symbol: 'Big.big',
      ratchet: {
        key: 'function:Big.big:occurrence:1:lines',
        value: 51,
        worseMessage:
          'Big.big grew from {base} to 51 lines (limit 50). Put new code in a new function.',
        heldMessage:
          'Big.big: 51 lines (limit 50), allowed because base was {base}; any increase fails.',
      },
      location: { line: 2 },
    });
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

    expect(identities[0]).toEqual('function:Big.big:occurrence:1:source:796ab01f9eb19cf455b6cda2');
    expect(identities[1]).toEqual('function:Big.big:occurrence:2:source:82386020526deefc6efbafdb');
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

  it('counts main and test classes per package', () => {
    writeClasses('src/main/java/demo', 7);
    writeClasses('src/test/java/demo', 6);
    writeFileSync(path.join(projectRoot, 'src/main/java/demo/notes.txt'), 'not code\n');

    expect(summary(readJavaFileLimitFindings(projectRoot, { manifest }))).toEqual([
      [RULE_IDS.folderFiles, 'src/main/java/demo', 'folder-files:source:7', 'structure'],
    ]);
  });

  it('limits Java lines to 100 characters, except string literals, and honours the exception', () => {
    writeClasses('src/main/java/demo', 1, `class A { ${'int a; '.repeat(40)}}\n`);
    writeClasses('src/test/java/demo', 1, `class T { String s = "${'t'.repeat(150)}"; }\n`);
    const found = (policy) =>
      readJavaFileLimitFindings(projectRoot, { manifest, policy }).map(
        ({ rule, path: findingPath }) => [rule, findingPath],
      );

    expect(found({})).toEqual([[RULE_IDS.lineLength, 'src/main/java/demo/C0.java']]);
    expect(found({ exceptions: [{ rule: 'line-length-limit', glob: 'src/main/**' }] })).toEqual([]);
  });

  it('applies the configured thresholds, exceptions and exclude globs', () => {
    writeClasses('src/main/java/demo', 3, 'a\nb\nc\n');
    writeClasses('src/main/java/gen', 3);
    writeClasses('src/test/java/demo', 3);

    const findings = readJavaFileLimitFindings(projectRoot, {
      manifest,
      policy: {
        thresholds: { fileLines: 2, folderFiles: 2 },
        exceptions: [{ rule: 'folder-files-limit', glob: 'src/test/java/**' }],
        exclude: ['src/main/java/gen/**'],
      },
    });

    expect(summary(findings).map(([rule, findingPath]) => [rule, findingPath])).toEqual([
      [RULE_IDS.fileLines, 'src/main/java/demo/C0.java'],
      [RULE_IDS.fileLines, 'src/main/java/demo/C1.java'],
      [RULE_IDS.fileLines, 'src/main/java/demo/C2.java'],
      [RULE_IDS.folderFiles, 'src/main/java/demo'],
    ]);
  });

  it('checks Kotlin and Java files of a Kotlin project and leaves line length to detekt', () => {
    const kotlinManifest = {
      ...manifest,
      kotlinSourceRoots: ['src/main/kotlin', 'src/main/java'],
      kotlinTestSourceRoots: ['src/test/kotlin'],
    };
    writeClasses('src/main/java/demo', 3);
    mkdirSync(path.join(projectRoot, 'src/main/kotlin/demo'), { recursive: true });
    mkdirSync(path.join(projectRoot, 'src/test/kotlin/demo'), { recursive: true });
    for (const name of ['A', 'B', 'C', 'D']) {
      writeFileSync(path.join(projectRoot, `src/main/kotlin/demo/${name}.kt`), 'class A\n');
      writeFileSync(path.join(projectRoot, `src/test/kotlin/demo/${name}Test.kt`), 'class T\n');
    }
    writeFileSync(
      path.join(projectRoot, 'src/main/kotlin/demo/Wide.kt'),
      `val wide = ${'1 + '.repeat(40)}1\n`,
    );
    writeFileSync(path.join(projectRoot, 'build.gradle.kts'), 'plugins {}\n');

    expect(
      summary(
        readJavaFileLimitFindings(projectRoot, {
          manifest: kotlinManifest,
          kotlin: true,
          policy: { thresholds: { folderFiles: 4 } },
        }),
      ).map(([rule, findingPath, identity]) => [rule, findingPath, identity]),
    ).toEqual([[RULE_IDS.folderFiles, 'src/main/kotlin/demo', 'folder-files:source:5']]);
  });

  it('fails a package more than 4 levels below the root package', () => {
    writeClasses('src/main/java/demo', 1);
    writeClasses('src/main/java/demo/a/b/c/d', 1);
    writeClasses('src/main/java/demo/a/b/c/d/e', 1);
    writeClasses('src/test/java/demo/a/b/c/d/e', 1);

    const found = (options) =>
      summary(readJavaFileLimitFindings(projectRoot, { manifest, ...options })).map(
        ([rule, findingPath, identity]) => [rule, findingPath, identity],
      );

    expect(found({})).toEqual([
      [RULE_IDS.folderDepth, 'src/main/java/demo/a/b/c/d/e', 'folder-depth:source:5'],
      [RULE_IDS.folderDepth, 'src/test/java/demo/a/b/c/d/e', 'folder-depth:test:5'],
    ]);
    expect(found({ policy: { thresholds: { folderDepth: 5 } } })).toEqual([]);
    expect(
      found({ policy: { exceptions: [{ rule: 'folder-depth-limit', glob: '**/e/**' }] } }),
    ).toEqual([]);
  });

  it('takes the root package from the base, so a new top-level package fails no legacy folder', () => {
    const baseRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-base-'));
    try {
      for (const folder of ['demo', 'demo/a/b/c/d']) {
        mkdirSync(path.join(baseRoot, 'src/main/java', folder), { recursive: true });
        writeFileSync(path.join(baseRoot, 'src/main/java', folder, 'A.java'), 'class A {}\n');
      }
      writeClasses('src/main/java/demo', 1);
      writeClasses('src/main/java/demo/a/b/c/d', 1);
      writeClasses('src/main/java/db/migration', 1);
      const found = (policy) =>
        readJavaFileLimitFindings(projectRoot, { manifest, policy }).map(
          ({ rule, path: findingPath }) => [rule, findingPath],
        );

      expect(found({})).toEqual([[RULE_IDS.folderDepth, 'src/main/java/demo/a/b/c/d']]);
      expect(found({ baselineRoot: baseRoot })).toEqual([]);
    } finally {
      rmSync(baseRoot, { recursive: true, force: true });
    }
  });

  it('checks the packages of Kotlin sources the same way', () => {
    mkdirSync(path.join(projectRoot, 'src/main/kotlin/demo/a/b/c/d/e'), { recursive: true });
    writeFileSync(path.join(projectRoot, 'src/main/kotlin/demo/Top.kt'), 'class Top\n');
    writeFileSync(path.join(projectRoot, 'src/main/kotlin/demo/a/b/c/d/e/Deep.kt'), 'class Deep\n');

    expect(
      summary(
        readJavaFileLimitFindings(projectRoot, {
          manifest: { ...manifest, kotlinSourceRoots: ['src/main/kotlin'] },
          kotlin: true,
        }),
      ).map(([rule, findingPath]) => [rule, findingPath]),
    ).toEqual([[RULE_IDS.folderDepth, 'src/main/kotlin/demo/a/b/c/d/e']]);
  });

  it('skips generated roots under build/ and roots outside the project', () => {
    writeClasses('build/generated/src', 7);
    writeClasses('src/main/java/demo', 2);

    expect(
      readJavaFileLimitFindings(projectRoot, {
        manifest: {
          sourceRoots: ['build/generated/src', 'src/main/java', '..'],
          testSourceRoots: [],
        },
      }),
    ).toEqual([]);
  });

  it('skips source roots that do not exist', () => {
    expect(readJavaFileLimitFindings(projectRoot, { manifest })).toEqual([]);
  });
});
