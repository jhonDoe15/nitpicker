import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { parseForbiddenApiUses, readForbiddenApiFindings } from './forbidden-apis.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const METHOD = 'Forbidden method invocation';
const REPORT = [
  'Picked up JAVA_TOOL_OPTIONS: -Dx=y',
  'Reading API signatures: /gradle/rules/forbidden-apis.txt',
  'Scanning classes for violations...',
  'ERROR: Forbidden class/interface use: java.util.Date ' +
    '[legacy-date-time: Use java.time instead of the legacy date classes.]',
  'ERROR:   in demo.Legacy (Legacy.java:11)',
  `ERROR: ${METHOD}: java.lang.Thread#sleep(**) [thread-sleep: Do not sleep in production code.]`,
  'ERROR:   in demo.Legacy$Worker (Legacy.java:15)',
  `ERROR: ${METHOD}: java.lang.Thread#<init>(**) [new-thread: Do not start threads by hand.]`,
  'ERROR:   in demo.Legacy (Legacy.java:16)',
  `ERROR: ${METHOD}: java.lang.Thread#sleep(**) [thread-sleep: Do not sleep in production code.]`,
  'ERROR:   in demo.Legacy$Worker (Legacy.java:30)',
  `ERROR: ${METHOD}: java.lang.Runtime#exec(java.lang.String, java.lang.String[]) ` +
    '[runtime-exec: Run commands with ProcessBuilder.]',
  'ERROR:   in gen.Generated (Generated.java:2)',
  'ERROR: Scanned 3 class file(s) for forbidden API invocations (in 0.17s), 5 error(s).',
  'ERROR: Check for forbidden API calls failed, see log.',
  '',
].join('\n');

function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-forbidden-'));
  roots.push(root);
  mkdirSync(path.join(root, 'build/nitpicker'), { recursive: true });
  mkdirSync(path.join(root, 'src/main/java/demo'), { recursive: true });
  writeFileSync(path.join(root, 'build/nitpicker/forbidden-apis.txt'), REPORT);
  return root;
}

const locate = (packageDirectory, fileName) =>
  packageDirectory === 'demo' ? `src/main/java/demo/${fileName}` : undefined;

describe('parseForbiddenApiUses', () => {
  it('pairs each violation with the class and line that follows it', () => {
    const uses = parseForbiddenApiUses(REPORT);

    expect(uses).toHaveLength(5);
    expect(uses[0]).toEqual({
      signature: 'java.util.Date',
      rule: 'legacy-date-time',
      text: 'Use java.time instead of the legacy date classes.',
      className: 'demo.Legacy',
      fileName: 'Legacy.java',
      line: 11,
    });
  });
});

describe('readForbiddenApiFindings', () => {
  it('reports each use as an enforceable finding named by its rule tag', () => {
    const root = project();

    const findings = readForbiddenApiFindings(path.join(root, 'build/nitpicker'), { locate });

    expect(findings.map(({ rule, path: file, location }) => [rule, file, location.line])).toEqual([
      ['legacy-date-time', 'src/main/java/demo/Legacy.java', 11],
      ['thread-sleep', 'src/main/java/demo/Legacy.java', 15],
      ['new-thread', 'src/main/java/demo/Legacy.java', 16],
      ['thread-sleep', 'src/main/java/demo/Legacy.java', 30],
    ]);
    expect(findings.map(({ tool, classification }) => [tool, classification])).toEqual(
      findings.map(() => ['forbiddenapis', 'enforceable']),
    );
    expect(findings.map(({ message }) => message)).toEqual([
      'Use java.time instead of the legacy date classes. Found: Date. ' +
        'If it is right here, add an exception for forbiddenapis/legacy-date-time in nitpicker.config.json.',
      'Do not sleep in production code. Found: Thread.sleep. ' +
        'If it is right here, add an exception for forbiddenapis/thread-sleep in nitpicker.config.json.',
      'Do not start threads by hand. Found: new Thread. ' +
        'If it is right here, add an exception for forbiddenapis/new-thread in nitpicker.config.json.',
      'Do not sleep in production code. Found: Thread.sleep. ' +
        'If it is right here, add an exception for forbiddenapis/thread-sleep in nitpicker.config.json.',
    ]);
    expect(() => parseAnalyzerReport({ findings }, 'java')).not.toThrow();
  });

  it('numbers repeats of the same use in a class and ignores a missing report', () => {
    const root = project();

    const findings = readForbiddenApiFindings(path.join(root, 'build/nitpicker'), { locate });

    expect(findings[3].identity).toBe(`${findings[1].identity}#2`);
    expect(readForbiddenApiFindings(path.join(root, 'nothing'), { locate })).toEqual([]);
  });
});
