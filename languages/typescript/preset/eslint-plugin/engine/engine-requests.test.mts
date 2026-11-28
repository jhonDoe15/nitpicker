import { describe, expect, it } from 'vitest';
import {
  conditionsHold,
  engineRuleName,
  engineSettings,
  isTypedOnEngine,
  runsOnEngine,
} from './engine-requests.mts';

describe('requests for plugin rules on the engine', () => {
  it('names only the plugin rules the engine runs', () => {
    expect(engineRuleName('nitpicker/no-silent-catch')).toBe('no-silent-catch');
    expect(engineRuleName('nitpicker/not-an-engine-rule')).toBe('nitpicker/not-an-engine-rule');
    expect(engineRuleName('no-silent-catch')).toBe('no-silent-catch');
  });

  it('knows which engine rules need types', () => {
    expect(isTypedOnEngine('nitpicker/no-mutating-method-in-domain')).toBe(true);
    expect(isTypedOnEngine('nitpicker/no-silent-catch')).toBe(false);
    expect(isTypedOnEngine('eqeqeq')).toBe(false);
  });

  it('runs a rule on the engine unless it has options the engine has no facts for', () => {
    expect(runsOnEngine(['nitpicker/no-silent-catch', 'error'])).toBe(true);
    expect(runsOnEngine(['nitpicker/no-silent-catch', ['error', { allow: true }]])).toBe(false);
    expect(runsOnEngine(['nitpicker/no-production-console', ['error', {}]])).toBe(true);
    expect(runsOnEngine(['eqeqeq', 'error'])).toBe(false);
  });

  it('gives facts only for chosen engine rules', () => {
    const request = {
      rules: { 'nitpicker/no-production-console': 'error', eqeqeq: 'error' },
      filename: 'src/a.ts',
      project: { root: process.cwd(), environment: {} },
    };

    expect(engineSettings({ ...request, chosen: new Set(Object.keys(request.rules)) })).toEqual([
      'no-production-console.streams-allowed=false',
    ]);
    expect(engineSettings({ ...request, chosen: new Set() })).toEqual([]);
  });

  it('checks the conditions the engine asked about', () => {
    const rule = 'nitpicker/report-module-load-effects';

    expect(conditionsHold(rule, undefined, 'a.ts')).toBe(true);
    expect(conditionsHold(rule, [['not-stylesheet', './a']], 'a.ts')).toBe(true);
    expect(conditionsHold(rule, [['not-stylesheet', './a.css']], 'a.ts')).toBe(false);
    expect(() => conditionsHold(rule, [['unknown', 'x']], 'a.ts')).toThrow(
      'The engine asked nitpicker/report-module-load-effects about unknown',
    );
    expect(() => conditionsHold('eqeqeq', [['not-stylesheet', 'x']], 'a.ts')).toThrow('eqeqeq');
  });
});
