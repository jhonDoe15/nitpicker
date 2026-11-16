import { beforeAll, describe, expect, it } from 'vitest';
import { decidedConditionFindings } from '../../../../../shared/rules/decided/decided-conditions.mjs';
import { javaParser, kotlinParser } from '../test-support/parse-jvm.mjs';

const parsers = {};

beforeAll(async () => {
  parsers.java = await javaParser();
  parsers.kotlin = await kotlinParser();
});

function decided(text, file) {
  const units = parsers[file.endsWith('.kt') ? 'kotlin' : 'java'](text, file);
  return decidedConditionFindings(units, {
    analyzerName: 'structure',
    isExcepted: () => false,
  }).map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

const java = (...lines) =>
  decided(['class Rules {', ...lines, '}'].join('\n'), 'src/main/java/shop/Rules.java');
const kotlin = (...lines) => decided(lines.join('\n'), 'src/main/kotlin/shop/Rules.kt');

describe('decided-condition on a coercion of the tested value', () => {
  it('reports Boolean.TRUE.equals under a test that already holds the value present and true', () => {
    expect(
      java(
        '  boolean on(Boolean x) {',
        '    if (x != null && x) { return Boolean.TRUE.equals(x); }',
        '    return false;',
        '  }',
      ),
    ).toEqual([
      '3: `Boolean.TRUE.equals(x)` is always true here: it is inside the `if (x != null && x)` on line 3',
    ]);
  });

  it('reports the coercion after a guard that returns when the value is absent or false', () => {
    expect(
      java(
        '  boolean on(Boolean x) {',
        '    if (x == null || !x) { return false; }',
        '    return Boolean.TRUE.equals(x);',
        '  }',
      ),
    ).toEqual([
      '4: `Boolean.TRUE.equals(x)` is always true here: line 3 returns when `x == null || !x` is true',
    ]);
  });

  it('reports the coercion in the arm of a conditional that the test decides', () => {
    expect(
      java(
        '  int pick(Boolean x) {',
        '    return x != null && x ? (Boolean.TRUE.equals(x) ? 1 : 2) : 3;',
        '  }',
      ),
    ).toEqual([
      '3: `Boolean.TRUE.equals(x)` is always true here: it is only reached when `x != null && x` is true',
    ]);
  });

  it('leaves the coercion alone when the test leaves the value open', () => {
    expect(
      java(
        '  boolean on(Boolean x) {',
        '    if (x == null) { return false; }',
        '    return Boolean.TRUE.equals(x);',
        '  }',
      ),
    ).toEqual([]);
  });

  it('reports x == true under if (x == true) in Kotlin', () => {
    expect(
      kotlin(
        'fun on(x: Boolean?): Boolean {',
        '    if (x == true) return x == true',
        '    return false',
        '}',
      ),
    ).toEqual(['2: `x == true` is always true here: it is inside the `if (x == true)` on line 2']);
  });

  it('leaves x == true alone after a null test that does not decide it', () => {
    expect(
      kotlin(
        'fun on(x: Boolean?): Boolean {',
        '    if (x != null) return x == true',
        '    return false',
        '}',
      ),
    ).toEqual([]);
  });
});
