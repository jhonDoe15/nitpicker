import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { classSummaries, classSummary } from './class-summary.mjs';

const roots = [];
const JAVAC = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'javac') : 'javac';

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function compiled(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-class-summary-'));
  roots.push(root);
  const sources = Object.entries(files).map(([name, text]) => {
    const file = path.join(root, 'src', name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
    return file;
  });
  execFileSync(JAVAC, ['-d', path.join(root, 'classes'), ...sources], { timeout: 10_000 });
  return path.join(root, 'classes');
}

describe('classSummary', () => {
  it('reads the name, supertypes, source file and referenced classes of a class', () => {
    const classes = compiled({
      'demo/Shapes.java': [
        'package demo;',
        'interface Named {}',
        'class Base {}',
        'class Square extends Base implements Named, Comparable<Square> {',
        '  java.util.Map<String, java.time.Duration> sizes(java.util.List<Base> bases) { return null; }',
        '  public int compareTo(Square other) { return 0; }',
        '}',
      ].join('\n'),
    });

    const summary = classSummary(readFileSync(path.join(classes, 'demo/Square.class')));

    expect({ ...summary, references: undefined }).toEqual({
      name: 'demo/Square',
      superName: 'demo/Base',
      interfaces: ['demo/Named', 'java/lang/Comparable'],
      sourceFile: 'Shapes.java',
      permitted: [],
      references: undefined,
    });
    expect(
      ['demo/Base', 'demo/Named', 'java/util/Map', 'java/util/List', 'java/time/Duration'].filter(
        (name) => summary.references.has(name),
      ),
    ).toEqual(['demo/Base', 'demo/Named', 'java/util/Map', 'java/util/List', 'java/time/Duration']);
  });

  it('reads the permitted subclasses of a sealed type', () => {
    const classes = compiled({
      'demo/Shape.java': 'package demo;\npublic sealed interface Shape permits Circle {}\n',
      'demo/Circle.java': 'package demo;\npublic final class Circle implements Shape {}\n',
    });

    expect(classSummary(readFileSync(path.join(classes, 'demo/Shape.class')))).toEqual({
      name: 'demo/Shape',
      superName: 'java/lang/Object',
      interfaces: [],
      sourceFile: 'Shape.java',
      permitted: ['demo/Circle'],
      references: new Set(['demo/Shape', 'java/lang/Object', 'demo/Circle']),
    });
  });
});

describe('classSummaries', () => {
  it('skips files that are not readable class files', () => {
    const classes = compiled({ 'demo/A.java': 'package demo;\nclass A {}\n' });
    writeFileSync(path.join(classes, 'demo/Broken.class'), 'not a class');

    expect(
      classSummaries([classes, path.join(classes, 'missing')]).map(({ name }) => name),
    ).toEqual(['demo/A']);
  });
});
