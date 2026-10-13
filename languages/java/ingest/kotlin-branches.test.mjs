import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestJacocoBranches } from './jacoco-branches.mjs';
import { isCompilerGeneratedBranchLine, suspensionCall } from './kotlin-branches.mjs';

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

describe('isCompilerGeneratedBranchLine', () => {
  it.each([
    'flow {',
    'emit(1)',
    'emit("in progress")',
    'emit("Hello!")',
    'emit(listOf(1).map { n -> n + 1 }.first())',
    'yield(2)',
    'delay(1)',
    'coroutineScope {',
    'a.await() + b.await()',
    'fun sequences(): List<Int> = sequence {',
    'val numbers = flow<Int> {',
    'suspend fun io(x: Int): Int = withContext(Dispatchers.IO) { x + 1 }',
    'emit("a // b")',
  ])('drops %s', (line) => {
    expect(isCompilerGeneratedBranchLine(line)).toBe(true);
  });

  it.each([
    'if (value < 0) {',
    'val found = lookup(key)',
    'flag',
    '&& b',
    '?.length',
    '.isNotEmpty()',
    'val kept = n.takeIf(::isEven)',
    'fun fallback(s: String): String = s.ifEmpty { "none" }',
    'return name.orEmpty()',
    'return -v.length',
    '1 -> "one"',
    'is Shape.Circle -> 3.0 * shape.radius * shape.radius',
    'fun display(): String = nickname ?: name',
    'require(items.isNotEmpty())',
    'if (ready) emit(1)',
    'for (n in 1..2) emit(n)',
    'emit(if (ready) 1 else 2)',
    'emit("${if (ready) "on" else "off"}")',
    'val both = a && delay(1)',
    'while (more) yield(next())',
  ])('keeps %s', (line) => {
    expect(isCompilerGeneratedBranchLine(line)).toBe(false);
  });
});

describe('suspensionCall', () => {
  it.each([
    ['for (n in 1..2) emit(n)', 'emit'],
    ['if (ready) yield(1)', 'yield'],
    ['val flowOfInts = flow<Int> {', 'flow'],
    ['val name = repo.find(id) ?: "unknown"', undefined],
    ['println("emit(1)")', undefined],
  ])('names the suspension call in %s', (line, call) => {
    expect(suspensionCall(line)).toBe(call);
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

    expect(everyLine).toEqual(
      expect.arrayContaining(['More.java:106', 'More.java:107', 'Coro.java:15', 'Coro.java:34']),
    );
    expect(everyLine.length).toBeGreaterThan(ingest(report).length);
  });

  it('skips a Kotlin file that is not in the source tree', () => {
    expect(ingest(report).some((finding) => finding.startsWith('Delegates'))).toBe(false);
  });
});

describe('changed-branch-coverage on Kotlin statements that span lines', () => {
  const multilineReport = readFileSync(path.join(fixtures, 'jacoco-kotlin-multiline.xml'), 'utf8');
  const multilineSource = (file) => {
    try {
      return readFileSync(path.join(fixtures, 'kotlin-multiline', file), 'utf8');
    } catch {
      return undefined;
    }
  };
  const findings = ingestJacocoBranches(multilineReport, {
    sourceRoot: 'src/main/kotlin',
    sourceText: multilineSource,
  }).findings;
  const lines = (name) =>
    findings
      .filter((finding) => finding.rule === 'changed-branch-coverage')
      .filter((finding) => path.basename(finding.path) === name)
      .map((finding) => finding.location.line);

  it('keeps the elvis, the condition and the operand that sit on a line of their own', () => {
    expect(lines('Multi.kt')).toEqual(expect.arrayContaining([6, 13, 22, 28, 54, 60, 63]));
    expect(lines('Legacy.kt')).toContain(11);
  });

  it('keeps the operand after a trailing && and ||', () => {
    expect(lines('Probe.kt')).toEqual(expect.arrayContaining([9, 18]));
  });

  it('keeps calls of inline standard library functions', () => {
    expect(lines('Multi.kt')).toEqual(expect.arrayContaining([35, 41]));
  });

  it('drops only the suspension lines, whatever else is on them', () => {
    expect(lines('Gen.kt')).toEqual([]);
    expect(lines('Exotic.kt')).not.toContain(25);
    expect(lines('Probe.kt')).not.toEqual(expect.arrayContaining([27, 33, 45]));
  });

  it('says which outcome a line that branches and suspends misses', () => {
    const forEmit = findings.find((finding) => finding.location?.line === 39);

    expect(forEmit.message).toContain('emit suspending');
  });

  it('reports a Kotlin file it cannot find without failing on it', () => {
    const notFound = findings.filter((finding) => finding.rule === 'branch-source-not-found');

    expect(notFound.map(({ path: file, classification }) => [file, classification])).toEqual([
      ['demo/flat/Flat.kt', 'descriptive'],
    ]);
  });
});
