import { describe, expect, it } from 'vitest';
import { validateConfig } from '../config.mjs';
import {
  commitAll,
  runTypescript,
  typescriptRepository,
  useTypescriptCli,
  writeFiles,
} from '../diff/fixtures/typescript-cli.mjs';

useTypescriptCli();

const WIDE = 'export function wide(a, b, c, d) {\n  return a + b + c + d;\n}\n';
const config = (...exceptions) =>
  `${JSON.stringify(validateConfig({ preset: 'javascript', exceptions }))}\n`;

describe('exceptions with "preset": "javascript"', () => {
  it('names the entry that accepts a wide function, and the entry accepts it', () => {
    const root = typescriptRepository({
      'src/main/b.js': 'export const b = 1;\n',
      'nitpicker.config.json': config(),
    });
    writeFiles(root, { 'src/main/a.js': WIDE });
    commitAll(root, 'add a wide function');

    const failing = runTypescript(root, ['structure']);

    expect(failing.exitCode, failing.text).toBe(1);
    expect(
      failing
        .json('new-findings.json')
        .filter(({ classification }) => classification === 'enforceable')
        .map(({ rule, symbol, message }) => [rule, symbol, message]),
    ).toEqual([
      [
        'function-parameters-limit',
        'wide',
        'wide has 4 parameters; limit is 3. If a reviewer agrees this is intended, add {"rule":"function-parameters-limit","paths":["src/main/a.js"],"function":"wide","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
      ],
    ]);

    writeFiles(root, {
      'nitpicker.config.json': config({
        rule: 'function-parameters-limit',
        paths: ['src/main/a.js'],
        function: 'wide',
        reason: 'A reviewed reason.',
      }),
    });
    commitAll(root, 'accept it');

    const accepted = runTypescript(root, ['structure']);

    expect(accepted.exitCode, accepted.text).toBe(0);
  });
});
