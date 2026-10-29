import { describe, expect, it } from 'vitest';
import {
  analyzerDeadlineMs,
  applyAnalyzerTimeouts,
  minutesSetting,
  validateAnalyzerTimeouts,
} from './analyzer-timeouts.mjs';

const MINUTE_MS = 60_000;

function analyzer(name) {
  return { name, timeoutMs: 1000 };
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
  it('sets the deadline of the named analyzers and marks it as configured', () => {
    const [eslint, java] = applyAnalyzerTimeouts(
      [analyzer('eslint'), analyzer('java')],
      { java: 45 },
      ['eslint', 'java'],
    );

    expect(eslint).toEqual(analyzer('eslint'));
    expect(java.timeoutMs).toBe(45 * MINUTE_MS);
    expect(java.configuredTimeout).toBe(true);
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

describe('analyzerDeadlineMs', () => {
  it('reads the deadline nitpicker passes to a configured analyzer', () => {
    expect(analyzerDeadlineMs({ NITPICKER_ANALYZER_TIMEOUT_MS: '600000' })).toBe(600_000);
  });

  it.each([{}, { NITPICKER_ANALYZER_TIMEOUT_MS: '' }, { NITPICKER_ANALYZER_TIMEOUT_MS: '1e3' }])(
    'is undefined for %j',
    (environment) => {
      expect(analyzerDeadlineMs(environment)).toBeUndefined();
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
