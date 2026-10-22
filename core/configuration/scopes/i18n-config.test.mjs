import { describe, expect, it } from 'vitest';
import { describeConfigOverrides } from '../config.mjs';
import { validateConfig } from '../validate.mjs';
import { policyHash } from '../../diff/reporting/report-model.mjs';

describe('i18n config key', () => {
  it('accepts enabled either way, the wrapper names and an empty object', () => {
    for (const i18n of [
      {},
      { enabled: true },
      { enabled: false },
      { functionNames: ['translate'], componentNames: ['Text', 'Label'] },
      { functionNames: [], componentNames: [] },
    ]) {
      expect(validateConfig({ i18n })).toEqual({ i18n });
    }
  });

  it.each([
    [[], /"i18n" must be an object/],
    ['react-intl', /"i18n" must be an object/],
    [
      { enable: true },
      /unknown i18n key "enable". Allowed i18n keys: enabled, functionNames, componentNames/,
    ],
    [{ enabled: 'yes' }, /"i18n.enabled" must be true or false/],
    [{ enabled: 1 }, /"i18n.enabled" must be true or false/],
    [{ functionNames: 'translate' }, /"i18n.functionNames" must be an array of non-empty strings/],
    [{ functionNames: [''] }, /"i18n.functionNames" must be an array of non-empty strings/],
    [{ componentNames: [1] }, /"i18n.componentNames" must be an array of non-empty strings/],
  ])('rejects i18n %j', (i18n, message) => {
    expect(() => validateConfig({ i18n })).toThrow(message);
  });

  it.each(['java', 'kotlin', 'python'])('is not supported with the %s preset', (preset) => {
    expect(() => validateConfig({ preset, i18n: {} })).toThrow(
      `"i18n" is not supported with "preset": "${preset}"`,
    );
  });

  it('rejects an exception that names an i18n rule nitpicker does not run', () => {
    const exception = (rule) => ({ rule, paths: ['src/**'], reason: 'Because' });

    const message = '"exceptions[0].rule" names formatjs/enforce-id, which nitpicker does not run';

    expect(() => validateConfig({ exceptions: [exception('formatjs/enforce-id')] })).toThrow(
      `${message}. The i18n rules it runs: formatjs/enforce-default-message`,
    );
    expect(
      validateConfig({
        exceptions: [exception('formatjs/enforce-description'), exception('no-debugger')],
      }),
    ).toBeDefined();
  });

  it('reports the override and changes the policy hash', () => {
    const overrides = describeConfigOverrides({ i18n: { enabled: false } });
    const analyzers = [{ name: 'a', version: '1', configurationHash: 'h' }];

    expect(overrides).toEqual(['i18n: {"enabled":false}']);
    expect(policyHash(analyzers, overrides)).not.toBe(policyHash(analyzers, []));
  });
});
