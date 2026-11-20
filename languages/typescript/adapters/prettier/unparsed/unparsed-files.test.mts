import { describe, expect, it } from 'vitest';
import { formattedOrUnparsed, unparsedFilesOf } from './unparsed-files.mts';

const PARSE_FAILURE = [
  '[error] src/data.json: SyntaxError: The input should contain exactly one expression. (5:1)',
  '[error]   3 | }',
  '[error]   4 |',
  '[error] > 5 | {',
  '[error]     | ^',
  '[error]   6 |   "b": 2',
  '',
].join('\n');

describe('files Prettier cannot parse', () => {
  it('are named by the parse errors of a serial run', () => {
    expect(unparsedFilesOf(PARSE_FAILURE)).toEqual(['src/data.json']);
    expect(
      unparsedFilesOf(`${PARSE_FAILURE}[error] a b.ts: SyntaxError: Unexpected token (1:1)\n`),
    ).toEqual(['src/data.json', 'a b.ts']);
  });

  it('are not assumed when the run failed for another reason', () => {
    expect(unparsedFilesOf('[error] Invalid configuration for file "/p/a.ts":\n')).toBeUndefined();
    expect(unparsedFilesOf(`${PARSE_FAILURE}[error] Cannot find package 'x'\n`)).toBeUndefined();
    expect(unparsedFilesOf('')).toBeUndefined();
  });

  it('turn a syntax error into a reason and pass any other failure on', async () => {
    const syntax = Object.assign(new Error('Unexpected token (1:1)\n> 1 | {'), {
      name: 'SyntaxError',
    });

    await expect(formattedOrUnparsed(() => Promise.resolve('a\n'))).resolves.toEqual({
      formatted: 'a\n',
    });
    await expect(formattedOrUnparsed(() => Promise.reject(syntax))).resolves.toEqual({
      reason: 'Unexpected token (1:1)',
    });
    await expect(formattedOrUnparsed(() => Promise.reject(new TypeError('boom')))).rejects.toThrow(
      'boom',
    );
  });
});
