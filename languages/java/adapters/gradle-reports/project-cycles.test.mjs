import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';

const fakeGradle = path.resolve(import.meta.dirname, '../fixtures/fake-gradle.mjs');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const CROSS_PROJECT_LOOP = {
  'modules.txt': 'lib\n',
  'src/main/java/demo/A.java': 'package demo;\n',
  'lib/src/main/java/demo/A.java': 'package demo;\n',
  'src/main/java/demo/a/A.java': 'package demo.a;\n',
  'lib/src/main/java/demo/b/B.java': 'package demo.b;\n',
  'jdeps-classes.txt': 'demo.a.A\n',
  'jdeps.txt': '   demo.a.A -> demo.b.B lib\n',
  'lib/jdeps-classes.txt': 'demo.b.B\n',
  'lib/jdeps.txt': '   demo.b.B -> demo.a.A app\n',
};

function cycleIdentities(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-cycles-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return collectJavaFindings(root, { gradle: fakeGradle, policy: {} })
    .filter((finding) => finding.rule === 'package-cycle')
    .map((finding) => `${finding.path} ${finding.identity}`);
}

describe('package cycles on a Gradle build with several projects', () => {
  it('reports one cycle through two projects, once for each of its packages', () => {
    expect(cycleIdentities(CROSS_PROJECT_LOOP).toSorted()).toEqual([
      'lib/src/main/java/demo/b/B.java cycle:lib/demo.b',
      'src/main/java/demo/a/A.java cycle:demo.a',
    ]);
  });

  it('leaves out the edge a sealed type in another project permits', () => {
    const files = { ...CROSS_PROJECT_LOOP, 'lib/permits.txt': 'demo.b.B -> demo.a.A\n' };

    expect(cycleIdentities(files)).toEqual([]);
  });

  it('keeps two projects with the same package names apart when neither uses the other', () => {
    const files = {
      'modules.txt': 'lib\n',
      'src/main/java/demo/A.java': 'package demo;\n',
      'lib/src/main/java/demo/A.java': 'package demo;\n',
      'jdeps-classes.txt': 'demo.a.A\ndemo.b.B\n',
      'jdeps.txt': '   demo.a.A -> demo.b.B app\n',
      'lib/jdeps-classes.txt': 'demo.b.C\ndemo.a.D\n',
      'lib/jdeps.txt': '   demo.b.C -> demo.a.D lib\n',
    };

    expect(cycleIdentities(files)).toEqual([]);
  });
});
