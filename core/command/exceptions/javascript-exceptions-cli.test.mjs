import { describe, expect, it } from 'vitest';
import { runCli } from '../../cli.mjs';
import { validateConfig } from '../../configuration/validate.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { commit } from '../../diff/git/test-support/git-repository.mjs';
import { useTypescriptCli } from './test-support/typescript-cli.mjs';

const { runTypescript, typescriptRepository } = useTypescriptCli(runCli);

const WIDE = 'export function wide(a, b, c, d) {\n  return a + b + c + d;\n}\n';
const config = (...exceptions) =>
  `${JSON.stringify(validateConfig({ preset: 'javascript', exceptions }))}\n`;

describe('exceptions with "preset": "javascript"', () => {
  it('names the entry that accepts a wide function, and the entry in the base policy accepts it', () => {
    const root = typescriptRepository({
      'src/main/b.js': 'export const b = 1;\n',
      'nitpicker.config.json': config(),
    });
    writeFiles(root, { 'src/main/a.js': WIDE });
    commit(root, 'add a wide function');

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
        'wide has 4 parameters; limit is 3. If this is intended, add {"rule":"function-parameters-limit","paths":["src/main/a.js"],"function":"wide","reason":"..."} to "exceptions" in nitpicker.config.json.',
      ],
    ]);

    const accepting = typescriptRepository({
      'src/main/a.js': 'export function wide(a, b, c) {\n  return a + b + c;\n}\n',
      'nitpicker.config.json': config({
        rule: 'function-parameters-limit',
        paths: ['src/main/a.js'],
        function: 'wide',
        reason: 'A reviewed reason.',
      }),
    });
    writeFiles(accepting, { 'src/main/a.js': WIDE });
    commit(accepting, 'add a parameter');

    const accepted = runTypescript(accepting, ['structure']);

    expect(accepted.exitCode, accepted.text).toBe(0);
  });
});
