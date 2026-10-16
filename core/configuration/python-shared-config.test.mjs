import { describe, expect, it } from 'vitest';
import { validateConfig } from './validate.mjs';

describe('config keys the python preset shares', () => {
  it('names what python does not support and what it shares', () => {
    expect(() => validateConfig({ preset: 'python', layout: {} })).toThrow(
      new Error(
        'nitpicker.config.json: "layout" is not supported with "preset": "python": it describes the TypeScript source layout and ESLint rules, which the Python preset does not have. Not supported with python: layout, exceptions, react, i18n, tools, except exceptions for file-lines-limit, line-length-limit, folder-files-limit, test-console-output. Shared by all presets: thresholds, exclude, legacyInventory; shared with TypeScript: testConsole',
      ),
    );
  });

  it('accepts the slow test budgets', () => {
    const thresholds = { unitTestSeconds: 2, integrationTestSeconds: 20 };

    expect(validateConfig({ preset: 'python', thresholds })).toEqual({
      preset: 'python',
      thresholds,
    });
  });

  it('lifts test-console-output in the top-level exceptions, beside the file limits', () => {
    const exceptions = [
      { rule: 'line-length-limit', paths: ['src/urls.py'], reason: 'URL table' },
      { rule: 'test-console-output', paths: ['tests/legacy/**'], reason: 'Old client warns' },
    ];
    const testConsole = { allow: [{ contains: 'old client', reason: 'Vendored client' }] };

    expect(validateConfig({ preset: 'python', exceptions, testConsole })).toEqual({
      preset: 'python',
      exceptions,
      testConsole,
    });
    expect(() =>
      validateConfig({
        preset: 'python',
        exceptions: [
          { rule: 'test-console-output', paths: ['a'], reason: 'r' },
          { rule: 'T201', paths: ['a'], reason: 'r' },
        ],
      }),
    ).toThrow('"exceptions" is not supported with "preset": "python"');
  });
});
