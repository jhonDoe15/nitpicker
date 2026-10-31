import { describe, expect, it } from 'vitest';
import { validateConfig } from '../validate.mjs';

const exception = { rule: 'no-console', paths: ['src/a.ts'], reason: 'CLI output' };

describe('config key typos', () => {
  it.each([
    [{ presets: 'typescript' }, 'unknown key "presets". Did you mean "preset"?'],
    [{ thresholds: { fileLine: 10 } }, 'unknown threshold "fileLine". Did you mean "fileLines"?'],
    [
      { layout: { sourceRoot: ['src'] } },
      'unknown layout key "sourceRoot". Did you mean "sourceRoots"?',
    ],
    [{ history: { cochange: true } }, 'unknown history key "cochange". Did you mean "coChange"?'],
    [
      { tools: { prettire: {} } },
      '"tools" names unknown tool "prettire". Did you mean "prettier"?',
    ],
    [
      { tools: { eslint: { precedance: [] } } },
      '"tools.eslint" has unknown key "precedance". Did you mean "precedence"?',
    ],
    [
      { exceptions: [{ ...exception, path: ['src/a.ts'] }] },
      'unknown key "path" in "exceptions[0]". Did you mean "paths"?',
    ],
    [
      { analyzers: [{ name: 'a', command: 'b', comand: 'c' }] },
      'unknown key "comand" in "analyzers[0]". Did you mean "command"?',
    ],
    [
      { preset: 'kotlin', kotlin: { formater: 'ktlint' } },
      'unknown key "kotlin.formater". Did you mean "formatter"?',
    ],
  ])('suggests the closest key for %j', (config, message) => {
    expect(() => validateConfig(config)).toThrow(`nitpicker.config.json: ${message}`);
  });

  it('lists the allowed keys when no key is close', () => {
    expect(() => validateConfig({ colour: 'red' })).toThrow(
      /^nitpicker\.config\.json: unknown key "colour"\. Allowed keys: base, preset, /u,
    );
  });
});
