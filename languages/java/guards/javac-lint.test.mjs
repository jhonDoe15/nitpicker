import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import { parseLintWarnings, readLintFindings } from './javac-lint.mjs';

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

describe('parseLintWarnings', () => {
  it('reads the file, line, lint category and text of each warning and skips the noise', () => {
    const warnings = parseLintWarnings(REPORT);

    expect(warnings).toHaveLength(7);
    expect(warnings[0]).toEqual({
      file: 'src/main/java/demo/Raw.java',
      line: 9,
      rule: 'rawtypes',
      text: 'found raw type: List',
    });
  });
});

describe('readLintFindings', () => {
  const files = ['src/main/java/demo/Raw.java', 'src/main/java/demo/Old.java'];

  it('turns each project warning into an enforceable javac finding that names the form and the exception', () => {
    const root = project(files);

    const findings = readLintFindings(path.join(root, 'build/nitpicker'), { projectRoot: root });

    expect(findings.map(({ rule, path: file }) => `${rule} ${path.basename(file)}`)).toEqual([
      'rawtypes Raw.java',
      'unchecked Raw.java',
      'rawtypes Raw.java',
      'rawtypes Raw.java',
      'deprecation Old.java',
      'removal Old.java',
    ]);
    expect(findings[0]).toEqual({
      tool: 'javac',
      rule: 'rawtypes',
      path: 'src/main/java/demo/Raw.java',
      identity: expect.any(String),
      classification: 'enforceable',
      location: { line: 9 },
      message:
        'found raw type: List. Add the type arguments, as in List<String>. ' +
        'If it is right here, add an exception for javac/rawtypes in nitpicker.config.json.',
    });
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
});
