import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../shared/rules/exceptions.mjs';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { parseLintWarnings, readLintFindings } from './javac-lint.mjs';
import {
  guardProject,
  javaClass,
  newLines,
  removeGuardProjects,
} from './test-support/guard-project.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const REPORT = `Picked up JAVA_TOOL_OPTIONS: -Dhttps.proxyHost=127.0.0.1
src/main/java/demo/Raw.java:9: warning: [rawtypes] found raw type: List
  List rawList() {
  ^
  missing type arguments for generic class List<E>
src/main/java/demo/Raw.java:16: warning: [unchecked] unchecked cast
    return (T) o;
               ^
  required: T
src/main/java/demo/Raw.java:19: warning: [rawtypes] found raw type: Map
src/main/java/demo/Raw.java:21: warning: [rawtypes] found raw type: Map
src/main/java/demo/Old.java:4: warning: [deprecation] exec(String) in Runtime has been deprecated
src/main/java/demo/Old.java:5: warning: [removal] finalize() in Object has been deprecated and marked for removal
build/generated/Gen.java:1: warning: [unchecked] unchecked cast
3 warnings
`;

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-lint-'));
  roots.push(root);
  mkdirSync(path.join(root, 'build/nitpicker'), { recursive: true });
  writeFileSync(path.join(root, 'build/nitpicker/javac-lint.txt'), REPORT);
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }
  return root;
}

const ADVICE = {
  rawtypes: 'Add the type arguments, as in List<String>.',
  unchecked:
    'Use a typed API, a checked conversion or a generic method instead of the unchecked operation.',
  deprecation: "Call the replacement named in the API's Javadoc.",
  removal: "Call the replacement named in the API's Javadoc; this API is going to be removed.",
};

function lintFinding(rule, [file, line, text]) {
  return {
    tool: 'javac',
    rule,
    path: `src/main/java/demo/${file}`,
    identity: expect.any(String),
    classification: 'enforceable',
    location: { line },
    message: `${text}. ${ADVICE[rule]}`,
  };
}

const PROJECT_FINDINGS = [
  lintFinding('rawtypes', ['Raw.java', 9, 'found raw type: List']),
  lintFinding('unchecked', ['Raw.java', 16, 'unchecked cast']),
  lintFinding('rawtypes', ['Raw.java', 19, 'found raw type: Map']),
  lintFinding('rawtypes', ['Raw.java', 21, 'found raw type: Map']),
  lintFinding('deprecation', ['Old.java', 4, 'exec(String) in Runtime has been deprecated']),
  lintFinding('removal', [
    'Old.java',
    5,
    'finalize() in Object has been deprecated and marked for removal',
  ]),
];

describe('parseLintWarnings', () => {
  it('reads the file, line, lint category and text of each warning and skips the noise', () => {
    expect(parseLintWarnings(REPORT)).toEqual([
      {
        file: 'src/main/java/demo/Raw.java',
        line: 9,
        rule: 'rawtypes',
        text: 'found raw type: List',
      },
      { file: 'src/main/java/demo/Raw.java', line: 16, rule: 'unchecked', text: 'unchecked cast' },
      {
        file: 'src/main/java/demo/Raw.java',
        line: 19,
        rule: 'rawtypes',
        text: 'found raw type: Map',
      },
      {
        file: 'src/main/java/demo/Raw.java',
        line: 21,
        rule: 'rawtypes',
        text: 'found raw type: Map',
      },
      {
        file: 'src/main/java/demo/Old.java',
        line: 4,
        rule: 'deprecation',
        text: 'exec(String) in Runtime has been deprecated',
      },
      {
        file: 'src/main/java/demo/Old.java',
        line: 5,
        rule: 'removal',
        text: 'finalize() in Object has been deprecated and marked for removal',
      },
      { file: 'build/generated/Gen.java', line: 1, rule: 'unchecked', text: 'unchecked cast' },
    ]);
  });
});

describe('readLintFindings', () => {
  const files = ['src/main/java/demo/Raw.java', 'src/main/java/demo/Old.java'];

  it('turns each project warning into an enforceable javac finding that names the form', () => {
    const root = project(files);

    const findings = readLintFindings(path.join(root, 'build/nitpicker'), { projectRoot: root });

    expect(findings).toEqual(PROJECT_FINDINGS);
    expect(() => parseAnalyzerReport({ findings }, 'java')).not.toThrow();
  });

  it('keeps a repeated message apart without using the line number', () => {
    const root = project(files);

    const findings = readLintFindings(path.join(root, 'build/nitpicker'), { projectRoot: root });

    const maps = findings.filter((finding) => finding.message.startsWith('found raw type: Map'));
    expect(maps.map((finding) => finding.identity.endsWith('#2'))).toEqual([false, true]);
  });

  it('skips warnings in files that are not part of the project and a missing report', () => {
    const root = project([]);

    expect(readLintFindings(path.join(root, 'build/nitpicker'), { projectRoot: root })).toEqual([]);
    expect(readLintFindings(path.join(root, 'nothing'), { projectRoot: root })).toEqual([]);
  });

  it('turns a failed lint compile into one descriptive notice instead of a tool error', () => {
    const root = project([]);
    const reports = path.join(root, 'nothing');
    mkdirSync(reports);
    writeFileSync(
      path.join(reports, 'javac-lint-failed.txt'),
      'Picked up JAVA_TOOL_OPTIONS: -Dx=y\nsrc/main/java/demo/A.java:3: error: cannot find symbol\n1 error\n',
    );

    const findings = readLintFindings(reports, {
      projectRoot: root,
      sourceRoots: ['src/main/java', 'src/main/generated'],
    });

    expect(findings).toEqual([
      {
        tool: 'javac',
        rule: 'lint-not-run',
        path: '.',
        identity: 'lint-not-run',
        classification: 'descriptive',
        toolNotRun: true,
        notRunScope: ['src/main/java', 'src/main/generated'],
        message:
          'No javac lint report from the lint compile (src/main/java/demo/A.java:3: error: cannot find symbol), ' +
          'so raw types, unchecked operations, deprecated calls and redundant casts were not checked. ' +
          'Fix what that compile reports (the main sources, the compile class path and Lombok). ' +
          exceptionHint('javac/lint-not-run', '**'),
      },
    ]);
    expect(() => parseAnalyzerReport({ findings }, 'java')).not.toThrow();
  });

  it('scopes the notice of a module without source roots to the module folder', () => {
    const root = project([]);
    const reports = path.join(root, 'nothing');
    mkdirSync(reports);
    writeFileSync(path.join(reports, 'javac-lint-failed.txt'), 'A.java:3: error: boom\n');

    const findings = readLintFindings(reports, {
      projectRoot: root,
      sourceRoots: [],
      module: { moduleDir: 'app' },
    });

    expect(findings.map(({ notRunScope }) => notRunScope)).toEqual([['app']]);
    expect(parseAnalyzerReport({ findings }, 'java').findings).toEqual(findings);
  });

  it('keeps comparing the project when the failed module compiles only sources outside it', () => {
    const head = project(['src/main/java/demo/Raw.java']);
    const base = project([]);
    const baseReports = path.join(base, 'failed');
    mkdirSync(baseReports);
    writeFileSync(path.join(baseReports, 'javac-lint-failed.txt'), 'A.java:3: error: boom\n');
    const baseFindings = readLintFindings(baseReports, {
      projectRoot: base,
      sourceRoots: ['../../x/src/main/java'],
      module: { moduleDir: '', modulePath: 'platform' },
    });
    const headFindings = readLintFindings(path.join(head, 'build/nitpicker'), {
      projectRoot: head,
    });

    expect(baseFindings.map(({ toolNotRun, notRunScope }) => [toolNotRun, notRunScope])).toEqual([
      [undefined, undefined],
    ]);
    expect(parseAnalyzerReport({ findings: baseFindings }, 'java').findings).toEqual(baseFindings);
    expect(
      compareFindings({ baseFindings, headFindings }).newFindings.map(
        (finding) => finding.classification,
      ),
    ).toEqual(['enforceable', 'enforceable', 'enforceable', 'enforceable']);
  });

  it('reports head warnings as descriptive when the base lint compile failed', () => {
    const head = project(['src/main/java/demo/Raw.java']);
    const base = project([]);
    const baseReports = path.join(base, 'failed');
    mkdirSync(baseReports);
    writeFileSync(path.join(baseReports, 'javac-lint-failed.txt'), 'A.java:3: error: boom\n');
    const headFindings = readLintFindings(path.join(head, 'build/nitpicker'), {
      projectRoot: head,
    });
    function compare(baseFindings) {
      return compareFindings({ baseFindings, headFindings }).newFindings;
    }

    const uncompared = compare(readLintFindings(baseReports, { projectRoot: base }));

    expect(uncompared).toEqual(
      [2, 3, 0, 1]
        .map((index) => PROJECT_FINDINGS[index])
        .map((finding) => ({
          ...finding,
          classification: 'descriptive',
          message: `${finding.message} Not enforced: no base javac report shows whether the change added it.`,
        })),
    );
    expect(compare([]).map((finding) => finding.classification)).toEqual([
      'enforceable',
      'enforceable',
      'enforceable',
      'enforceable',
    ]);
  });

  it('relaxes only the warnings under the source roots of the module whose base lint failed', () => {
    const head = project(['src/main/java/demo/Raw.java']);
    const base = project([]);
    const baseReports = path.join(base, 'failed');
    mkdirSync(baseReports);
    writeFileSync(path.join(baseReports, 'javac-lint-failed.txt'), 'A.java:3: error: boom\n');
    const headFindings = readLintFindings(path.join(head, 'build/nitpicker'), {
      projectRoot: head,
    });
    function compare(sourceRoots) {
      return compareFindings({
        baseFindings: readLintFindings(baseReports, { projectRoot: base, sourceRoots }),
        headFindings,
      }).newFindings.map((finding) => finding.classification);
    }

    expect(compare(['legacy/src/main/java'])).toEqual([
      'enforceable',
      'enforceable',
      'enforceable',
      'enforceable',
    ]);
    expect(compare([''])).toEqual(['descriptive', 'descriptive', 'descriptive', 'descriptive']);
  });
});

describe('javac identities', () => {
  afterEach(() => {
    removeGuardProjects();
  });

  const MAPS = javaClass('class A {', ['java.util.Map first;', 'java.util.Map second;']);
  const MAPS_ADDED = javaClass('class A {', [
    'java.util.Map added;',
    'java.util.Map first;',
    'java.util.Map second;',
  ]);

  function lintFindings(files) {
    const root = guardProject(files);
    return readLintFindings(path.join(root, 'reports'), { projectRoot: root });
  }

  function rawMap(file, lines) {
    return lines.map((line) => `${file}:${String(line)}: warning: [rawtypes] found raw type: Map`);
  }

  it('keeps the javac warnings of a file moved to another package', () => {
    const base = lintFindings({
      'src/main/java/demo/A.java': MAPS,
      'reports/javac-lint.txt': rawMap('src/main/java/demo/A.java', [3, 4]).join('\n'),
    });
    const head = lintFindings({
      'src/main/java/moved/A.java': MAPS.replace('package demo;', 'package moved;'),
      'reports/javac-lint.txt': rawMap('src/main/java/moved/A.java', [3, 4]).join('\n'),
    });

    expect(
      newLines(base, head, new Map([['src/main/java/demo/A.java', 'src/main/java/moved/A.java']])),
    ).toEqual([]);
  });

  it('reports the javac warning of an added line, not of a legacy line with the same message', () => {
    const base = lintFindings({
      'src/main/java/demo/A.java': MAPS,
      'reports/javac-lint.txt': rawMap('src/main/java/demo/A.java', [3, 4]).join('\n'),
    });
    const head = lintFindings({
      'src/main/java/demo/A.java': MAPS_ADDED,
      'reports/javac-lint.txt': rawMap('src/main/java/demo/A.java', [3, 4, 5]).join('\n'),
    });

    expect(newLines(base, head)).toEqual([['src/main/java/demo/A.java', 3]]);
  });
});
