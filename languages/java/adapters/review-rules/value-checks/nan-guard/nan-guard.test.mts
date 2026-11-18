import { describe, expect, it } from 'vitest';
import { parseSource as untypedParse } from '../../max-value-sums/source-file.mjs';
import { NAN_GUARD_CHECK as untypedCheck } from './nan-guard.mjs';

type Found = { readonly line: number; readonly name: string };

const parseSource: (text: string, options: { file: string; kotlin: boolean }) => unknown =
  untypedParse;
const check: { find: (source: unknown) => Found[] } = untypedCheck;

function lines(body: string, kotlin = false): number[] {
  return check
    .find(parseSource(`class A {\n${body}\n}\n`, { file: kotlin ? 'A.kt' : 'A.java', kotlin }))
    .map(({ line }) => line);
}

describe('NanOnlyGuard in Java', () => {
  it('reports isNaN as the only check on a parsed double', () => {
    expect(
      lines(
        [
          'double read(String text, double fallback) {',
          '  double value = Double.parseDouble(text);',
          '  if (Double.isNaN(value)) { return fallback; }',
          '  return value;',
          '}',
        ].join('\n'),
      ),
    ).toEqual([4]);
  });

  it('reports Double.valueOf and Float.parseFloat', () => {
    expect(
      lines(
        [
          'void a(String t) { Double v = Double.valueOf(t); if (v.isNaN()) { throw new IllegalArgumentException(); } }',
          'void b(String t) { float v = Float.parseFloat(t); if (Float.isNaN(v)) { ' +
            'throw new IllegalArgumentException(); } }',
        ].join('\n'),
      ),
    ).toEqual([2, 3]);
  });

  it('leaves isFinite, an infinity check and range checks', () => {
    expect(
      lines(
        [
          'double a(String t) { double v = Double.parseDouble(t); if (!Double.isFinite(v)) { return 0; } return v; }',
          'double b(String t) { double v = Double.parseDouble(t); if ' +
            '(Double.isNaN(v) || Double.isInfinite(v)) { return 0; } return v; }',
          'double c(String t) { double v = Double.parseDouble(t); if ' +
            '(Double.isNaN(v) || v < 0 || v > 100) { return 0; } return v; }',
          'boolean d(double v) { return Double.isNaN(v); }',
          'double e(String t) { double v = Double.parseDouble(t); return ' +
            'Double.isNaN(v) || v == Double.POSITIVE_INFINITY ? 0 : v; }',
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});

describe('NanOnlyGuard in Kotlin', () => {
  it('reports isNaN on toDoubleOrNull and leaves isFinite', () => {
    expect(
      lines(
        [
          'fun a(text: String): Double {',
          '  val value = text.toDoubleOrNull() ?: return 0.0',
          '  if (value.isNaN()) return 0.0',
          '  return value',
          '}',
          'fun b(text: String): Double {',
          '  val value = text.toDoubleOrNull() ?: return 0.0',
          '  if (!value.isFinite()) return 0.0',
          '  return value',
          '}',
        ].join('\n'),
        true,
      ),
    ).toEqual([4]);
  });
});
