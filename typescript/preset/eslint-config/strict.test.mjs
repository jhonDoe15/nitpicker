import { describe, expect, it } from 'vitest';
import { failureMessagesFor } from '../failure-messages/harness.mjs';
import strictConfig from './strict.mjs';

function messages(code, filename = 'src/fixture.ts') {
  return failureMessagesFor({ config: strictConfig, filename, code });
}

describe('strict escape-hatch rules', () => {
  it.each([
    ['as const', 'export const modes = ["a", "b"] as const;'],
    ['unknown', 'export function read(input: unknown) { return input; }'],
    ['undefined', 'export const value = undefined;'],
    ['strict null comparison', 'export function isNull(value: unknown) { return value === null; }'],
    [
      'strict null inequality',
      'export function present(value: unknown) { return value !== null; }',
    ],
    ['JSON.stringify replacer', 'export const text = JSON.stringify({ a: 1 }, null, 2);'],
    ['tool directive', '/* istanbul ignore next */\nexport const value = 1;'],
    ['ts-check', '// @ts-check\nexport const value = 1;'],
    ['shebang', '#!/usr/bin/env node\nexport const value = 1;'],
  ])('allows %s', (_name, code) => {
    expect(messages(code)).toEqual([]);
  });

  it('does not apply to test files', () => {
    expect(messages('// note', 'src/fixture.test.ts')).toEqual([
      'No matching configuration found for src/fixture.test.ts.',
    ]);
  });
});
