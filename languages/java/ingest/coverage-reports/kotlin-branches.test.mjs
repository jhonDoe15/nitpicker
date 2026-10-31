import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestJacocoBranches } from './jacoco-branches.mjs';
import {
  isCompilerGeneratedBranchLine,
  libraryBranchCount,
  libraryCalls,
  suspensionCall,
} from './kotlin-branches.mjs';

const fixtures = path.resolve(import.meta.dirname, '..', 'fixtures');
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

describe('libraryCalls', () => {
  it.each([
    ['val both = t.orEmpty() + u?.orEmpty()', ['orEmpty', 'orEmpty'], 4],
    [
      'if (!name.isNullOrBlank() && list.isNullOrEmpty()) return',
      ['isNullOrBlank', 'isNullOrEmpty'],
      8,
    ],
    ['fun String?.orEmpty(): String = this ?: ""', [], 0],
    ['fun orEmpty(text: String?) = text', [], 0],
    ['fun maxOf(a: Int, b: Int, c: Int): Int = if (a > b) a else b', [], 0],
    ['val widest = maxOf(a, b)', [], 0],
    ['val name = cache.orEmpty(key)', [], 0],
    ['println("t.orEmpty()") // t.isNullOrEmpty()', [], 0],
  ])('finds the inlined library calls in %s', (line, calls, branches) => {
    expect(libraryCalls(line)).toEqual(calls);
    expect(libraryBranchCount(line)).toBe(branches);
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
    expect(ingest(report).some((finding) => finding.startsWith('Delegates'))).toBe(false);
  });
});

describe('changed-branch-coverage on Kotlin lines that call an inlined library function', () => {
  const measured = [
    ['fun a(t: String?): String = t.orEmpty()', 2],
    ['fun b(t: List<Int>?): Boolean = t.isNullOrEmpty()', 4],
    ['fun c(t: String?): Boolean = t.isNullOrBlank()', 4],
    ['fun d(t: String?): Boolean = t.orEmpty() == "x"', 2],
    ['fun e(t: String?, u: String?): String = t.orEmpty() + u.orEmpty()', 4],
    ['fun f(a: List<String?>): List<String> = a.map { it.orEmpty() }', 2],
    ['fun g(t: String?): Boolean = !t.isNullOrBlank()', 6],
    ['fun h(t: String?): Int = if (t.isNullOrEmpty()) -1 else 1', 6],
    ['t.isNullOrEmpty()', 6],
    ['u.isNullOrBlank()', 6],
    ['fun i(t: String?): Int? = runCatching { t.orEmpty().toInt() }.getOrNull()', 4],
    ['fun j(t: String?): Boolean = t.orEmpty().length > 0', 4],
    ["fun k(t: String?): String = t.orEmpty().filter { it > 'a' }", 4],
    [
      'fun l(t: String?, n: Int): Int { var c = 0; repeat(n) { c++ }; return c + t.orEmpty().length }',
      4,
    ],
    ['fun m(t: Array<Int>?): Boolean = t.isNullOrEmpty()', 6],
    ['fun String?.orEmpty(): String = this ?: ""', 2],
  ];
  const lines = measured
    .map(
      ([, total], index) =>
        `<line nr="${String(index + 3)}" mi="0" ci="5" mb="1" cb="${String(total - 1)}"/>`,
    )
    .join('');
  const findings = ingestJacocoBranches(
    `<report name="r"><package name="demo"><sourcefile name="Names.kt">${lines}</sourcefile></package></report>`,
    {
      sourceRoot: 'src/main/kotlin',
      sourceText: () => ['package demo', '', ...measured.map(([line]) => line)].join('\n'),
    },
  ).findings;

  it('drops a line whose branch count is that of its library calls and keeps every other line', () => {
    expect(findings.map(({ location }) => measured[location.line - 3][0])).toEqual(
      measured.slice(6).map(([line]) => line),
    );
  });

  it('says how to take the null arm of the library call on a line it keeps', () => {
    expect(findings[0].message).toBe(
      'Branch coverage is 83.33%; minimum is 95%. Not taken: a branch of this line or of isNullOrBlank, which is inlined from the standard library (pass null to take its null arm). Test it, or remove it if it can\'t happen. To accept the file, add it to "exclude" in nitpicker.config.json.',
    );
    expect(findings.at(-1).message).not.toContain('inlined');
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

  it('keeps every line a statement spans and drops only the suspension lines', () => {
    expect(
      findings
        .filter((finding) => finding.rule === 'changed-branch-coverage')
        .map((finding) => `${path.basename(finding.path)}:${String(finding.location.line)}`),
    ).toEqual([
      'Legacy.kt:4',
      'Legacy.kt:11',
      'Multi.kt:3',
      'Multi.kt:6',
      'Multi.kt:13',
      'Multi.kt:22',
      'Multi.kt:28',
      'Multi.kt:29',
      'Multi.kt:32',
      'Multi.kt:35',
      'Multi.kt:36',
      'Multi.kt:41',
      'Multi.kt:44',
      'Multi.kt:54',
      'Multi.kt:60',
      'Multi.kt:63',
      'Multi.kt:70',
      'Multi.kt:72',
      'Probe.kt:9',
      'Probe.kt:18',
      'Probe.kt:39',
      'Exotic.kt:20',
    ]);
  });

  it('says which outcome a line that branches and suspends misses', () => {
    expect(findings.find((finding) => finding.location?.line === 39).message).toBe(
      'Branch coverage is 75.00%; minimum is 95%. Not taken: emit suspending (move the call to its own line if no branch of yours is untested). Test it, or remove it if it can\'t happen. To accept the file, add it to "exclude" in nitpicker.config.json.',
    );
  });

  it('reports a Kotlin file it cannot find without failing on it', () => {
    const notFound = findings.filter((finding) => finding.rule === 'branch-source-not-found');

    expect(notFound.map(({ path: file, classification }) => [file, classification])).toEqual([
      ['demo/flat/Flat.kt', 'descriptive'],
    ]);
  });
});
