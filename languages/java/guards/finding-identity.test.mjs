import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { readForbiddenApiFindings } from './forbidden-apis.mjs';
import { readLintFindings } from './javac-lint.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const SLEEP =
  'ERROR: Forbidden method invocation: java.lang.Thread#sleep(**) [thread-sleep: Do not sleep.]';

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-identity-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function locate(packageDirectory, fileName) {
  return `src/main/java/${packageDirectory}/${fileName}`;
}

function lintFindings(files) {
  const root = project(files);
  return readLintFindings(path.join(root, 'reports'), { projectRoot: root });
}

function forbiddenFindings(files) {
  const root = project(files);
  return readForbiddenApiFindings(path.join(root, 'reports'), { locate, projectRoot: root });
}

function rawMap(file, lines) {
  return lines.map((line) => `${file}:${String(line)}: warning: [rawtypes] found raw type: Map`);
}

function sleeps(className, lines) {
  return lines.flatMap((line) => [SLEEP, `ERROR:   in ${className} (Pause.java:${String(line)})`]);
}

function newLines(base, head, renames = new Map()) {
  return compareFindings({
    baseFindings: base,
    headFindings: head,
    baseToHeadRenames: renames,
  }).newFindings.map((finding) => [finding.path, finding.location.line]);
}

const MAPS = 'package demo;\nclass A {\n  java.util.Map first;\n  java.util.Map second;\n}\n';
const MAPS_ADDED =
  'package demo;\nclass A {\n  java.util.Map added;\n  java.util.Map first;\n  java.util.Map second;\n}\n';
const PAUSE =
  'package demo;\nclass Pause {\n  void a() { Thread.sleep(1); }\n  void b() { Thread.sleep(2); }\n}\n';
const PAUSE_ADDED =
  'package demo;\nclass Pause {\n  void c() { Thread.sleep(3); }\n  void a() { Thread.sleep(1); }\n  void b() { Thread.sleep(2); }\n}\n';

describe('javac and forbiddenapis identities', () => {
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

  it('keeps the forbiddenapis uses of a class moved to another package', () => {
    const base = forbiddenFindings({
      'src/main/java/demo/Pause.java': PAUSE,
      'reports/forbidden-apis.txt': sleeps('demo.Pause', [3, 4]).join('\n'),
    });
    const head = forbiddenFindings({
      'src/main/java/moved/Pause.java': PAUSE.replace('package demo;', 'package moved;'),
      'reports/forbidden-apis.txt': sleeps('moved.Pause', [3, 4]).join('\n'),
    });

    expect(
      newLines(
        base,
        head,
        new Map([['src/main/java/demo/Pause.java', 'src/main/java/moved/Pause.java']]),
      ),
    ).toEqual([]);
  });

  it('reports the forbiddenapis use of an added line, not of a legacy line', () => {
    const base = forbiddenFindings({
      'src/main/java/demo/Pause.java': PAUSE,
      'reports/forbidden-apis.txt': sleeps('demo.Pause', [3, 4]).join('\n'),
    });
    const head = forbiddenFindings({
      'src/main/java/demo/Pause.java': PAUSE_ADDED,
      'reports/forbidden-apis.txt': sleeps('demo.Pause', [3, 4, 5]).join('\n'),
    });

    expect(newLines(base, head)).toEqual([['src/main/java/demo/Pause.java', 3]]);
  });
});
