import { describeConfigOverrides } from '../config.mjs';
import { policyHash } from '../../diff/reporting/report-model.mjs';
import { describe, expect, it } from 'vitest';
import { validateConfig } from '../validate.mjs';

describe('the i18n key', () => {
  it.each([[{}], [{ enabled: true }], [{ enabled: false }], [{ functionNames: ['t'] }]])(
    'is an error with the javascript preset, which points to the typescript preset (%j)',
    (i18n) => {
      expect(() => validateConfig({ preset: 'javascript', i18n })).toThrow(
        'nitpicker.config.json: "i18n" is not supported with "preset": "javascript": the message rules check react-intl messages and the text in JSX, which belong to the TypeScript preset, so remove the key, or use "preset": "typescript" for a project with translated messages',
      );
    },
  );

  it('is still accepted with the typescript preset and with no preset', () => {
    const i18n = { enabled: true, functionNames: ['t'] };

    expect(validateConfig({ preset: 'typescript', i18n })).toEqual({ preset: 'typescript', i18n });
    expect(validateConfig({ i18n })).toEqual({ i18n });
  });
});

describe('the react key', () => {
  it.each([[{}], [{ enabled: true }], [{ enabled: false }], [{ styling: 'css-in-js' }]])(
    'is an error with the javascript preset, which points to the typescript preset (%j)',
    (react) => {
      expect(() => validateConfig({ preset: 'javascript', react })).toThrow(
        'nitpicker.config.json: "react" is not supported with "preset": "javascript": React and JSX belong to the TypeScript preset, so remove the key, or use "preset": "typescript" for a React project',
      );
    },
  );

  it('is still accepted with the typescript preset and with no preset', () => {
    const react = { enabled: true, styling: 'class-names' };

    expect(validateConfig({ preset: 'typescript', react })).toEqual({
      preset: 'typescript',
      react,
    });
    expect(validateConfig({ react })).toEqual({ react });
  });
});

describe('react keys', () => {
  it('accepts enabled and every styling approach', () => {
    const reactKeys = [
      {},
      { enabled: true },
      { enabled: false },
      { styling: 'class-names' },
      { styling: 'css-in-js' },
      { styling: 'inline-style' },
      { enabled: true, styling: 'css-in-js' },
    ];
    expect(reactKeys.map((react) => validateConfig({ react }))).toEqual(
      reactKeys.map((react) => ({ react })),
    );
  });

  it.each([
    [[], /"react" must be an object/],
    ['react', /"react" must be an object/],
    [{ enable: true }, /unknown react key "enable". Did you mean "enabled"\?$/],
    [{ enabled: 'yes' }, /"react.enabled" must be true or false/],
    [{ enabled: 1 }, /"react.enabled" must be true or false/],
    [
      { styling: 'tailwind' },
      /"react.styling" must be one of: class-names, css-in-js, inline-style/,
    ],
  ])('rejects react %j', (react, message) => {
    expect(() => validateConfig({ react })).toThrow(message);
  });

  it('reports the react override and changes the policy hash', () => {
    const overrides = describeConfigOverrides({ react: { styling: 'css-in-js' } });
    const analyzers = [{ name: 'a', version: '1', configurationHash: 'h' }];

    expect(overrides).toEqual(['react: {"styling":"css-in-js"}']);
    expect(policyHash(analyzers, overrides)).not.toBe(policyHash(analyzers, []));
  });
});
