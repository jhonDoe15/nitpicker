import { describe, expect, it } from 'vitest';
import {
  applyAnalyzerTimeouts,
  commandTimeoutMs,
  minutesSetting,
  validateAnalyzerTimeouts,
} from './analyzer-timeouts.mjs';

const MINUTE_MS = 60_000;

function analyzer(name, invocation = { command: 'node', args: [] }) {
  return { name, timeoutMs: 1000, createInvocation: () => invocation };
}

describe('validateAnalyzerTimeouts', () => {
  it('accepts whole minutes up to the Node.js timer limit', () => {
    expect(() => {
      validateAnalyzerTimeouts({ java: 1, eslint: 35_791 });
    }).not.toThrow();
  });

  it.each([[[]], ['30'], [null]])('rejects %j as the setting', (value) => {
    expect(() => {
      validateAnalyzerTimeouts(value);
    }).toThrow('"analyzerTimeoutMinutes" must be an object');
  });

  it.each([0, -1, 1.5, '30', 35_792, Number.NaN])('rejects %j minutes', (minutes) => {
    expect(() => {
      validateAnalyzerTimeouts({ java: minutes });
    }).toThrow('"analyzerTimeoutMinutes.java" must be a whole number of minutes from 1 to 35791');
  });

  it('rejects an empty analyzer name', () => {
    expect(() => {
      validateAnalyzerTimeouts({ ' ': 5 });
    }).toThrow('"analyzerTimeoutMinutes" needs non-empty analyzer names');
  });
});

describe('applyAnalyzerTimeouts', () => {
  it('sets the deadline and passes it to the analyzer process', () => {
    const [eslint, java] = applyAnalyzerTimeouts(
      [analyzer('eslint'), analyzer('java', { command: 'node', args: [], env: { A: '1' } })],
      { java: 45 },
      ['eslint', 'java'],
    );

    expect(eslint.timeoutMs).toBe(1000);
    expect(eslint.createInvocation({}).env).toBeUndefined();
    expect(java.timeoutMs).toBe(45 * MINUTE_MS);
    expect(java.createInvocation({}).env).toEqual({
      A: '1',
      NITPICKER_ANALYZER_TIMEOUT_MS: String(45 * MINUTE_MS),
    });
  });

  it('keeps the parent environment when the invocation sets none', () => {
    const [custom] = applyAnalyzerTimeouts([analyzer('house-rules')], { 'house-rules': 2 }, [
      'house-rules',
    ]);

    expect(custom.createInvocation({}).env).toMatchObject({
      PATH: process.env.PATH,
      NITPICKER_ANALYZER_TIMEOUT_MS: String(2 * MINUTE_MS),
    });
  });

  it('names an unknown analyzer and the known ones', () => {
    expect(() =>
      applyAnalyzerTimeouts([analyzer('eslint')], { eslnt: 5 }, ['eslint', 'prettier-format']),
    ).toThrow(
      '"analyzerTimeoutMinutes" names unknown analyzers: eslnt. Known analyzers: eslint, prettier-format',
    );
  });

  it('accepts a known analyzer that is not running, such as a disabled one', () => {
    expect(applyAnalyzerTimeouts([], { mutation: 90 }, ['mutation'])).toEqual([]);
  });
});

describe('commandTimeoutMs', () => {
  it('follows the analyzer deadline when one is configured', () => {
    expect(commandTimeoutMs(4 * MINUTE_MS, { NITPICKER_ANALYZER_TIMEOUT_MS: '600000' })).toBe(
      600_000,
    );
  });

  it.each([{}, { NITPICKER_ANALYZER_TIMEOUT_MS: '' }, { NITPICKER_ANALYZER_TIMEOUT_MS: '1e3' }])(
    'keeps the default for %j',
    (environment) => {
      expect(commandTimeoutMs(4 * MINUTE_MS, environment)).toBe(4 * MINUTE_MS);
    },
  );
});

describe('minutesSetting', () => {
  const limits = { fallbackMs: 7, maxMinutes: 10 };

  it('reads whole minutes and falls back when unset', () => {
    expect(minutesSetting({ X: '10' }, 'X', limits)).toBe(10 * MINUTE_MS);
    expect(minutesSetting({}, 'X', limits)).toBe(7);
  });

  it.each(['0', '11', '', '1.5', '5m'])('rejects %j', (value) => {
    expect(() => minutesSetting({ X: value }, 'X', limits)).toThrow(
      'X must be a whole number from 1 to 10 (minutes)',
    );
  });
});
