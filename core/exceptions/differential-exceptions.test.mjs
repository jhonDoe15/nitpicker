import { describe, expect, it } from 'vitest';
import {
  commitAll,
  runTypescript,
  typescriptRepository,
  useTypescriptCli,
  writeFiles,
} from '../diff/fixtures/typescript-cli.mjs';

useTypescriptCli();

const WIDE =
  'export function wide(a: number, b: number, c: number, d: number): number {\n  return a + b + c + d;\n}\n';
const enforceable = (result) =>
  result
    .json('new-findings.json')
    .filter(({ classification }) => classification === 'enforceable')
    .map(({ rule, symbol }) => [rule, symbol]);
const config = (...exceptions) => `${JSON.stringify({ exceptions })}\n`;
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
    commitAll(root, 'drop the exception');

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
    commitAll(root, 'narrow the exception');

    const result = runTypescript(root, ['structure']);

    expect(result.exitCode, result.text).toBe(0);
    expect(enforceable(result)).toEqual([]);
  });

  it('accepts new code with the exception that lifts it in the same change', () => {
    const root = typescriptRepository({ 'src/main/b.ts': 'export const b = 1;\n' });
    writeFiles(root, { 'src/main/a.ts': WIDE, 'nitpicker.config.json': config(lifted) });
    commitAll(root, 'add a wide function and its exception');

    const result = runTypescript(root, ['structure']);

    expect(result.exitCode, result.text).toBe(0);
    expect(enforceable(result)).toEqual([]);
  });

  it('fails the same new code without the exception', () => {
    const root = typescriptRepository({ 'src/main/b.ts': 'export const b = 1;\n' });
    writeFiles(root, { 'src/main/a.ts': WIDE });
    commitAll(root, 'add a wide function');

    const result = runTypescript(root, ['structure']);

    expect(result.exitCode, result.text).toBe(1);
    expect(enforceable(result)).toEqual([['function-parameters-limit', 'wide']]);
  });
});
