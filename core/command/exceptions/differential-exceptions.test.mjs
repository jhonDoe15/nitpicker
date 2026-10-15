import { describe, expect, it } from 'vitest';
import { runCli } from '../../cli.mjs';
import { validateConfig } from '../../configuration/validate.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { commit } from '../../diff/git/test-support/git-repository.mjs';
import { useTypescriptCli } from './test-support/typescript-cli.mjs';

const { runTypescript, typescriptRepository } = useTypescriptCli(runCli);

const WIDE =
  'export function wide(a: number, b: number, c: number, d: number): number {\n  return a + b + c + d;\n}\n';
const enforceable = (result) =>
  result
    .json('new-findings.json')
    .filter(({ classification }) => classification === 'enforceable')
    .map(({ rule, symbol }) => [rule, symbol]);
const config = (...exceptions) => `${JSON.stringify(validateConfig({ exceptions }))}\n`;
const lifted = {
  rule: 'function-parameters-limit',
  paths: ['src/main/a.ts'],
  function: 'wide',
  reason: 'A reviewed reason.',
};

describe('exceptions in the differential gate', () => {
  it('keeps a legacy finding unchanged when the change removes the exception that lifted it', () => {
    const root = typescriptRepository({
      'src/main/a.ts': WIDE,
      'nitpicker.config.json': config(lifted),
    });
    writeFiles(root, { 'nitpicker.config.json': '{}\n', 'src/main/b.ts': 'export const b = 1;\n' });
    commit(root, 'drop the exception');

    const result = runTypescript(root, ['structure']);

    expect(result.exitCode, result.text).toBe(0);
    expect(enforceable(result)).toEqual([]);
  });

  it('keeps a legacy finding unchanged when the change narrows the exception', () => {
    const root = typescriptRepository({
      'src/main/a.ts': WIDE,
      'nitpicker.config.json': config(lifted),
    });
    writeFiles(root, {
      'nitpicker.config.json': config({ ...lifted, function: 'other' }),
      'src/main/b.ts': 'export const b = 1;\n',
    });
    commit(root, 'narrow the exception');

    const result = runTypescript(root, ['structure']);

    expect(result.exitCode, result.text).toBe(0);
    expect(enforceable(result)).toEqual([]);
  });

  it('accepts new code with the exception that lifts it in the same change', () => {
    const root = typescriptRepository({ 'src/main/b.ts': 'export const b = 1;\n' });
    writeFiles(root, { 'src/main/a.ts': WIDE, 'nitpicker.config.json': config(lifted) });
    commit(root, 'add a wide function and its exception');

    const result = runTypescript(root, ['structure']);

    expect(result.exitCode, result.text).toBe(0);
    expect(enforceable(result)).toEqual([]);
  });

  it('fails the same new code without the exception', () => {
    const root = typescriptRepository({ 'src/main/b.ts': 'export const b = 1;\n' });
    writeFiles(root, { 'src/main/a.ts': WIDE });
    commit(root, 'add a wide function');

    const result = runTypescript(root, ['structure']);

    expect(result.exitCode, result.text).toBe(1);
    expect(enforceable(result)).toEqual([['function-parameters-limit', 'wide']]);
  });

  it('notes, without failing, an exception whose paths match no file', () => {
    const root = typescriptRepository({
      'src/main/a.ts': WIDE,
      'nitpicker.config.json': config(lifted, { ...lifted, paths: ['src/old/**'] }),
    });

    const result = runTypescript(root, ['structure']);

    expect(result.exitCode, result.text).toBe(0);
    expect(result.text.slice(result.text.indexOf('Note:'))).toBe(
      'Note: 1 exception matching no file (not failing; remove or fix it):\n  exceptions[1] (function-parameters-limit) matches no file: src/old/**\n',
    );
  });
});
