import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exceptionHint } from './test-support/kotlin-finding-views.mts';
import { useTempProjects } from './test-support/temp-projects.mts';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { compareFindings as untypedCompare } from '../../../../../core/diff/comparison/compare.mjs';
import {
  parseCompilerWarnings as untypedParseCompilerWarnings,
  readCompilerFindings as untypedReadCompilerFindings,
} from './kotlin-compiler.mjs';

const parseCompilerWarnings: (output: string) => { rule: string; line: number }[] =
  untypedParseCompilerWarnings;
const readCompilerFindings: (
  reports: string,
  mainRoots: string[],
  testRoots?: string[],
) => Finding[] = untypedReadCompilerFindings;

const compareFindings: (request: {
  baseFindings: Finding[];
  headFindings: Finding[];
  baseToHeadRenames: Map<string, string>;
  touchedCode: undefined;
  unknownOnBase: undefined;
}) => Record<string, unknown[]> = untypedCompare;

const { projectWith: sourcesIn } = useTempProjects('nitpicker-kotlinc-');

function projectWith(report: unknown, files = ['src/main/kotlin/demo/A.kt']) {
  const root = sourcesIn(Object.fromEntries(files.map((file) => [file, 'package demo\n'])));
  mkdirSync(path.join(root, 'reports'));
  if (report !== undefined) {
    writeFileSync(path.join(root, 'reports/kotlinc.json'), JSON.stringify(report));
  }
  return root;
}

const OUTPUT = [
  "src/main/kotlin/demo/A.kt:7:5: warning: [DEPRECATION] 'fun a(): Int' is deprecated. use b.",
  '    a()',
  '    ^',
  'src/main/kotlin/demo/A.kt:8:19: warning: [USELESS_CAST] Cast is redundant.',
  "src/main/kotlin/demo/A.kt:10:18: warning: [UNCHECKED_CAST] Unchecked cast of 'Any' to 'List<String>'.",
  "src/main/kotlin/demo/A.kt:12:18: warning: [UNCHECKED_CAST] Unchecked cast of 'Any' to 'List<String>'.",
  "src/main/kotlin/demo/A.kt:13:9: warning: [UNUSED_VARIABLE] Variable 'x' is never used.",
  "build/generated/G.kt:1:1: warning: [DEPRECATION] 'fun a(): Int' is deprecated.",
].join('\n');

describe('parseCompilerWarnings', () => {
  it('keeps the warnings that match the javac lint and drops the rest', () => {
    expect(
      parseCompilerWarnings(OUTPUT).map(({ rule, line }) => `${rule}@${String(line)}`),
    ).toEqual(['deprecation@7', 'cast@8', 'unchecked@10', 'unchecked@12', 'deprecation@1']);
  });
});

describe('readCompilerFindings', () => {
  it('reports each warning in a project file with advice and a line-free identity', () => {
    const root = projectWith({ exitCode: 0, output: OUTPUT });
    const findings = readCompilerFindings(path.join(root, 'reports'), ['src/main/kotlin']);

    const hashed: unknown = expect.stringMatching(/^deprecation:[0-9a-f]+$/);

    expect(findings[0]).toEqual({
      tool: 'kotlinc',
      rule: 'deprecation',
      path: 'src/main/kotlin/demo/A.kt',
      identity: hashed,
      message:
        "Call the replacement the deprecation names (its `ReplaceWith`, or the Javadoc of a Java API). The compiler warns: 'fun a(): Int' is deprecated. use b.",
      classification: 'enforceable',
      location: { line: 7 },
    });
    expect(findings.map(({ rule }) => rule)).toEqual([
      'deprecation',
      'cast',
      'unchecked',
      'unchecked',
    ]);
    expect(findings[3]?.identity).toBe(`${String(findings[2]?.identity)}#2`);
    expect(findings[1]?.message).toBe('Remove the cast. The compiler warns: Cast is redundant.');
  });

  it('reports a lint compile that failed as not run, naming its first error', () => {
    const root = projectWith({
      exitCode: 1,
      output:
        "src/main/kotlin/demo/A.kt:3:1: error: [UNRESOLVED_REFERENCE] Unresolved reference 'serializer'.\n",
    });

    expect(readCompilerFindings(path.join(root, 'reports'), ['src/main/kotlin'])).toEqual([
      {
        tool: 'kotlinc',
        rule: 'lint-not-run',
        path: '.',
        identity: 'lint-not-run',
        message: `No kotlinc lint report from the lint compile of the main sources (src/main/kotlin/demo/A.kt:3:1: error: [UNRESOLVED_REFERENCE] Unresolved reference 'serializer'.), so unchecked casts, deprecated calls and redundant casts were not checked there. Fix what that compile reports (the main sources, the compile class path and the compiler plugins). ${exceptionHint('kotlinc/lint-not-run', '**')}`,
        classification: 'descriptive',
      },
    ]);
  });

  it('reads the test report apart from the main one, so each root set keeps its own warnings', () => {
    const root = projectWith({ exitCode: 0, output: OUTPUT });
    writeFileSync(
      path.join(root, 'reports/kotlinc-test.json'),
      JSON.stringify({
        exitCode: 0,
        output:
          "src/test/kotlin/demo/ATest.kt:4:9: warning: [UNCHECKED_CAST] Unchecked cast of 'Any' to 'List<String>'.\nsrc/main/kotlin/demo/A.kt:8:19: warning: [USELESS_CAST] Cast is redundant.",
      }),
    );

    const findings = readCompilerFindings(
      path.join(root, 'reports'),
      ['src/main/kotlin'],
      ['src/test/kotlin'],
    );

    expect(findings.map(({ rule, path: file }) => `${rule} ${file}`)).toEqual([
      'deprecation src/main/kotlin/demo/A.kt',
      'cast src/main/kotlin/demo/A.kt',
      'unchecked src/main/kotlin/demo/A.kt',
      'unchecked src/main/kotlin/demo/A.kt',
      'unchecked src/test/kotlin/demo/ATest.kt',
    ]);
  });

  it('reports a failed test lint compile as not run on its own identity', () => {
    const root = projectWith({ exitCode: 0, output: '' });
    writeFileSync(
      path.join(root, 'reports/kotlinc-test.json'),
      JSON.stringify({ exitCode: 1, output: 'error: the class path could not be resolved: x' }),
    );

    const [notRun] = readCompilerFindings(
      path.join(root, 'reports'),
      ['src/main/kotlin'],
      ['src/test/kotlin'],
    );

    expect(notRun).toEqual({
      tool: 'kotlinc',
      rule: 'lint-not-run',
      path: '.',
      identity: 'lint-not-run:test',
      message: `No kotlinc lint report from the lint compile of the test sources (error: the class path could not be resolved: x), so unchecked casts, deprecated calls and redundant casts were not checked there. Fix what that compile reports (the test sources, the compile class path and the compiler plugins). ${exceptionHint('kotlinc/lint-not-run', '**')}`,
      classification: 'descriptive',
    });
  });

  it('reports nothing without a report', () => {
    const root = projectWith(undefined);

    expect(readCompilerFindings(path.join(root, 'reports'), ['src/main/kotlin'])).toEqual([]);
  });

  it('keeps a warning that names a class of a package that moved, and not one that names another', () => {
    const at = (typeName: string) => {
      const warning = `src/main/kotlin/demo/A.kt:7:5: warning: [UNCHECKED_CAST] Unchecked cast of 'Any' to '${typeName}'.`;
      const root = projectWith({ exitCode: 0, output: warning });
      return readCompilerFindings(path.join(root, 'reports'), ['src/main/kotlin']);
    };
    const compared = (base: Finding[], head: Finding[]) => {
      const result = compareFindings({
        baseFindings: base,
        headFindings: head,
        touchedCode: undefined,
        unknownOnBase: undefined,
        baseToHeadRenames: new Map([
          ['src/main/kotlin/shop/service/Request.kt', 'src/main/kotlin/shop/audit/Request.kt'],
        ]),
      });
      return [result['newFindings']?.length, result['unchangedFindings']?.length];
    };

    expect(compared(at('shop.service.Request'), at('shop.audit.Request'))).toEqual([0, 1]);
    expect(compared(at('a.Request'), at('b.Request'))).toEqual([1, 0]);
  });
});
