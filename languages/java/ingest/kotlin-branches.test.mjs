import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestJacocoBranches } from './jacoco-branches.mjs';
import { hasBranchingSyntax } from './kotlin-branches.mjs';

const fixtures = path.resolve(import.meta.dirname, 'fixtures');
const report = readFileSync(path.join(fixtures, 'jacoco-kotlin.xml'), 'utf8');

const sourceText = (file) => {
  try {
    return readFileSync(path.join(fixtures, 'kotlin-measurement', file), 'utf8');
  } catch {
    return undefined;
  }
};

const ingest = (xml) =>
  ingestJacocoBranches(xml, { sourceRoot: 'src/main/kotlin', sourceText }).findings.map(
    (finding) => `${path.basename(finding.path)}:${String(finding.location.line)}`,
  );

describe('hasBranchingSyntax', () => {
  it.each([
    'if (value < 0) {',
    'return if (value == 0) "zero" else "positive"',
    'fun both(a: Boolean, b: Boolean): Boolean = a && b',
    'fun either(a: Boolean, b: Boolean): Boolean = a || b',
    'fun display(): String = nickname ?: name',
    'fun nickLength(): Int = nickname?.length ?: 0',
    'fun forced(): Int = nickname!!.length',
    'fun castOrNull(value: Any): String? = value as? String',
    '1 -> "one"',
    'is Shape.Circle -> 3.0 * shape.radius * shape.radius',
    'for (value in values) {',
    'while (i > 0) {',
    '} while (steps < 3)',
    'require(items.isNotEmpty())',
    'check(initialized)',
    'values.filter { it % 2 == 0 }',
  ])('sees a branch in %s', (line) => {
    expect(hasBranchingSyntax(line)).toBe(true);
  });

  it.each([
    'flow {',
    'emit(1)',
    'yield(2)',
    'delay(1)',
    'coroutineScope {',
    'a.await() + b.await()',
    'fun sequences(): List<Int> = sequence {',
    'val numbers = flow<Int> {',
    'val pairs = mutableListOf<Pair<String, Int>>()',
    'return result',
    '}',
  ])('sees no branch in %s', (line) => {
    expect(hasBranchingSyntax(line)).toBe(false);
  });
});

describe('changed-branch-coverage on Kotlin sources', () => {
  it('reports the branches the tests missed and not the compiler-generated ones', () => {
    expect(ingest(report)).toEqual([
      'More.kt:10',
      'More.kt:112',
      'More.kt:120',
      'Coro.kt:44',
      'Coro.kt:45',
    ]);
  });

  it('would report the coroutine state machine lines if every line counted', () => {
    const asJava = report.replaceAll(/sourcefile name="(\w+)\.kt"/g, 'sourcefile name="$1.java"');
    const everyLine = ingestJacocoBranches(asJava, {
      sourceRoot: 'src/main/kotlin',
      sourceText: (file) => sourceText(file.replace(/\.java$/, '.kt')),
    }).findings.map((finding) => `${path.basename(finding.path)}:${String(finding.location.line)}`);

    expect(everyLine).toEqual([
      'More.java:10',
      'More.java:106',
      'More.java:107',
      'More.java:108',
      'More.java:112',
      'More.java:120',
      'Coro.java:15',
      'Coro.java:16',
      'Coro.java:17',
      'Coro.java:18',
      'Coro.java:34',
      'Coro.java:38',
      'Coro.java:44',
      'Coro.java:45',
    ]);
    expect(everyLine.length).toBeGreaterThan(ingest(report).length);
  });

  it('skips a Kotlin file that is not in the source tree', () => {
    expect(ingest(report)).not.toContain(expect.stringContaining('Delegates'));
  });
});
