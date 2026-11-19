import { describe, expect, it } from 'vitest';
import { linesOf } from '../../test-support/check-runner.mts';
import { NAN_GUARD_CHECK } from './nan-guard.mjs';

const lines = linesOf(NAN_GUARD_CHECK);

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
        { kotlin: true },
      ),
    ).toEqual([4]);
  });
});
