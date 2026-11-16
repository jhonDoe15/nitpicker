import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_VALUE_RULE, readMaxValueFindings } from './max-value-sums.mjs';

const roots = [];
const PROJECT = {
  qualifier: '',
  sourceRoots: ['src/main/java'],
  testSourceRoots: ['src/test/java'],
  kotlinSourceRoots: ['src/main/kotlin'],
  kotlinTestSourceRoots: ['src/test/kotlin'],
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function lines({ files, kotlin }) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-jvm-max-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return readMaxValueFindings(root, { projects: [PROJECT], kotlin }).map(
    ({ rule, path: file, location }) => `${rule} ${file}:${String(location.line)}`,
  );
}

function java(body, extra = '') {
  return lines({
    files: { 'src/main/java/shop/Text.java': `package shop;\nclass Text {\n${body}\n}\n${extra}` },
    kotlin: false,
  });
}

function kotlin(body) {
  return lines({
    files: { 'src/main/kotlin/shop/Text.kt': `package shop\n${body}\n` },
    kotlin: true,
  });
}

const JAVA_FILE = 'src/main/java/shop/Text.java';
const KOTLIN_FILE = 'src/main/kotlin/shop/Text.kt';

describe('Java sums that overflow on a maximum-value sentinel', () => {
  it('reports the commons-cli shape: a constant passed through a parameter into Math.min', () => {
    expect(
      java(
        [
          '  static final int UNSET_MAX_WIDTH = Integer.MAX_VALUE;',
          '  int indexOfWrap(String text, int width, int startPos) {',
          '    return Math.min(startPos + width, text.length());',
          '  }',
          '  int whole(String text) {',
          '    return indexOfWrap(text, UNSET_MAX_WIDTH, 0);',
          '  }',
        ].join('\n'),
      ),
    ).toEqual([`${MAX_VALUE_RULE} ${JAVA_FILE}:5`]);
  });

  it('reports a field default reaching a sum through an accessor', () => {
    expect(
      java(
        [
          '  private int maxWidth = Integer.MAX_VALUE;',
          '  int getMaxWidth() { return maxWidth; }',
          '  int end(String text, int start) {',
          '    return Math.min(start + getMaxWidth(), text.length());',
          '  }',
        ].join('\n'),
      ),
    ).toEqual([`${MAX_VALUE_RULE} ${JAVA_FILE}:6`]);
  });

  it('reports offset + limit for an unbounded page, stored in a variable that bounds a sublist', () => {
    expect(
      java(
        [
          '  java.util.List<String> page(java.util.List<String> items, int offset, int limit) {',
          '    int end = offset + limit;',
          '    return items.subList(offset, Math.min(end, items.size()));',
          '  }',
          '  java.util.List<String> all(java.util.List<String> items) {',
          '    return page(items, 0, Integer.MAX_VALUE);',
          '  }',
        ].join('\n'),
      ),
    ).toEqual([`${MAX_VALUE_RULE} ${JAVA_FILE}:4`]);
  });

  it('reports a local maximum, a long maximum, a compound add and a comparison', () => {
    expect(
      java(
        [
          '  boolean expired(long now) {',
          '    long timeout = Long.MAX_VALUE;',
          '    return now + timeout < 10;',
          '  }',
          '  int grow(int[] values, int more) {',
          '    int limit = 2147483647;',
          '    limit += more;',
          '    return values[limit];',
          '  }',
        ].join('\n'),
      ),
    ).toEqual([`${MAX_VALUE_RULE} ${JAVA_FILE}:5`, `${MAX_VALUE_RULE} ${JAVA_FILE}:9`]);
  });

  it('allows comparing without adding, widening, addExact, a sentinel check and a clamp', () => {
    expect(
      java(
        [
          '  static final int NONE = Integer.MAX_VALUE;',
          '  boolean fits(String text, int start, int width) {',
          '    return width >= text.length() - start;',
          '  }',
          '  long widened(String text, int start, int width) {',
          '    return Math.min((long) start + width, text.length());',
          '  }',
          '  int exact(String text, int start, int width) {',
          '    return Math.min(Math.addExact(start, width), text.length());',
          '  }',
          '  int checked(String text, int start, int width) {',
          '    if (width == NONE) {',
          '      return text.length();',
          '    }',
          '    return Math.min(start + width, text.length());',
          '  }',
          '  int clamped(String text, int start, int width) {',
          '    width = Math.min(width, text.length());',
          '    return Math.min(start + width, text.length());',
          '  }',
          '  void callers(String text) {',
          '    fits(text, 0, NONE);',
          '    widened(text, 0, NONE);',
          '    exact(text, 0, NONE);',
          '    checked(text, 0, NONE);',
          '    clamped(text, 0, NONE);',
          '  }',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('ignores the sum of two ordinary parameters and sums that reach no bound', () => {
    expect(
      java(
        [
          '  static final int NONE = Integer.MAX_VALUE;',
          '  int ordinary(String text, int start, int width) {',
          '    return Math.min(start + width, text.length());',
          '  }',
          '  int total(int count) {',
          '    return count + NONE;',
          '  }',
          '  void callers(String text) {',
          '    ordinary(text, 1, 2);',
          '  }',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('does not let a parameter that shadows a maximum field carry it', () => {
    expect(
      java(
        [
          '  private int width = Integer.MAX_VALUE;',
          '  int shifted(String text, int width, int start) {',
          '    return Math.min(start + width, text.length());',
          '  }',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('leaves test sources alone', () => {
    expect(
      lines({
        files: {
          'src/test/java/shop/TextTest.java':
            'package shop;\nclass TextTest {\n  int run(int start) {\n    int w = Integer.MAX_VALUE;\n    return Math.min(start + w, 3);\n  }\n}\n',
        },
        kotlin: false,
      }),
    ).toEqual([]);
  });

  it('finds the sentinel across files', () => {
    expect(
      lines({
        files: {
          'src/main/java/shop/Limits.java':
            'package shop;\npublic final class Limits {\n  public static final int UNLIMITED = Integer.MAX_VALUE;\n}\n',
          'src/main/java/shop/Pager.java':
            'package shop;\nclass Pager {\n  int end(int offset, int size) {\n    return Math.min(offset + size, 9);\n  }\n  int all() {\n    return end(0, Limits.UNLIMITED);\n  }\n}\n',
        },
        kotlin: false,
      }),
    ).toEqual([`${MAX_VALUE_RULE} src/main/java/shop/Pager.java:4`]);
  });

  it('names the allowed forms and the exception route in the message', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-jvm-max-'));
    roots.push(root);
    mkdirSync(path.join(root, 'src/main/java/shop'), { recursive: true });
    writeFileSync(
      path.join(root, JAVA_FILE),
      'package shop;\nclass Text {\n  int f(int start) {\n    int w = Integer.MAX_VALUE;\n    return Math.min(start + w, 3);\n  }\n}\n',
    );
    const [found] = readMaxValueFindings(root, { projects: [PROJECT], kotlin: false });
    expect(found.message).toBe(
      '`w` can hold Integer.MAX_VALUE (a "no limit" value), so `start + w` overflows to a negative number that is then used as an index, length, bound or comparison. Compare without adding (`width >= length - start`), widen first (`(long) start + width`), use `Math.addExact`, or check the sentinel before the arithmetic (`if (w == Integer.MAX_VALUE) ...`). If this is intended, add {"rule":"pmd/MaxValueOverflow","paths":["src/main/java/shop/Text.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });
});

describe('Java sums: guards, returned and chosen maximums, page sizes', () => {
  it('keeps reporting when the operand was only checked for a sign', () => {
    expect(
      java(
        [
          '  static final int NONE = Integer.MAX_VALUE;',
          '  int run(String text, int start, int width) {',
          '    if (width < 0) {',
          '      throw new IllegalArgumentException();',
          '    }',
          '    return Math.min(start + width, text.length());',
          '  }',
          '  void call(String text) {',
          '    run(text, 0, NONE);',
          '  }',
        ].join('\n'),
      ),
    ).toEqual([`${MAX_VALUE_RULE} ${JAVA_FILE}:8`]);
  });

  it('accepts a bound comparison as the guard', () => {
    expect(
      java(
        [
          '  int run(String text, int start, int width) {',
          '    if (width >= text.length() - start) {',
          '      return text.length();',
          '    }',
          '    return Math.min(start + width, text.length());',
          '  }',
          '  void call(String text) {',
          '    run(text, 0, Integer.MAX_VALUE);',
          '  }',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('reports a maximum added directly inside Math.min', () => {
    expect(java('  int run(int n) {\n    return Math.min(Integer.MAX_VALUE + n, 5);\n  }')).toEqual(
      [`${MAX_VALUE_RULE} ${JAVA_FILE}:4`],
    );
  });

  it('reports a maximum returned by a method and one chosen by a ternary', () => {
    expect(
      java(
        [
          '  static int unlimited() {',
          '    return Integer.MAX_VALUE;',
          '  }',
          '  int viaMethod(int start, String text) {',
          '    return Math.min(start + unlimited(), text.length());',
          '  }',
          '  int viaTernary(int start, boolean all, String text) {',
          '    int width = all ? Integer.MAX_VALUE : 10;',
          '    return Math.min(start + width, text.length());',
          '  }',
        ].join('\n'),
      ),
    ).toEqual([`${MAX_VALUE_RULE} ${JAVA_FILE}:7`, `${MAX_VALUE_RULE} ${JAVA_FILE}:11`]);
  });

  it('reports offset plus the size of a PageRequest created with the maximum', () => {
    expect(
      java(
        [
          '  int end(int offset, int[] rows) {',
          '    Pageable all = PageRequest.of(0, Integer.MAX_VALUE);',
          '    return Math.min(offset + all.getPageSize(), rows.length);',
          '  }',
          '  int ordinary(int offset, int[] rows) {',
          '    Pageable some = PageRequest.of(0, 20);',
          '    return Math.min(offset + some.getPageSize(), rows.length);',
          '  }',
        ].join('\n'),
      ),
    ).toEqual([`${MAX_VALUE_RULE} ${JAVA_FILE}:5`]);
  });
});

describe('Kotlin sums that overflow on a maximum-value sentinel', () => {
  it('reports a default parameter value reaching Math.min', () => {
    expect(
      kotlin(
        [
          'fun indexOfWrap(text: String, startPos: Int, width: Int = Int.MAX_VALUE): Int {',
          '    return minOf(startPos + width, text.length)',
          '}',
        ].join('\n'),
      ),
    ).toEqual([`${MAX_VALUE_RULE} ${KOTLIN_FILE}:3`]);
  });

  it('reports a constant passed by name and a Long timeout compared with a deadline', () => {
    expect(
      kotlin(
        [
          'const val FOREVER = Long.MAX_VALUE',
          'fun due(now: Long, timeout: Long): Boolean = now + timeout < 5',
          'fun run() = due(1, timeout = FOREVER)',
          'fun page(items: List<String>, offset: Int, limit: Int): List<String> {',
          '    val end = offset + limit',
          '    return items.subList(offset, minOf(end, items.size))',
          '}',
          'fun all(items: List<String>) = page(items, 0, limit = Int.MAX_VALUE)',
        ].join('\n'),
      ),
    ).toEqual([`${MAX_VALUE_RULE} ${KOTLIN_FILE}:3`, `${MAX_VALUE_RULE} ${KOTLIN_FILE}:6`]);
  });

  it('allows widening, a sentinel check and comparing without adding', () => {
    expect(
      kotlin(
        [
          'const val NONE = Int.MAX_VALUE',
          'fun widened(text: String, start: Int, width: Int = NONE): Long =',
          '    minOf(start.toLong() + width, text.length.toLong())',
          'fun checked(text: String, start: Int, width: Int = NONE): Int {',
          '    if (width == NONE) return text.length',
          '    return minOf(start + width, text.length)',
          '}',
          'fun fits(text: String, start: Int, width: Int = NONE) = width >= text.length - start',
          'fun ordinary(text: String, start: Int, width: Int) = minOf(start + width, text.length)',
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});
