import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { ts } from '../../../../preset/eslint-plugin/rules/typed/typescript-views.mts';
import { applied, leftNote } from '../test-support/apply-recipe.mts';
import { uselessCatchRecipe } from './useless-catch.mts';

function thrownBy(source: string): unknown {
  const script = ts.transpileModule(source.replaceAll('export ', ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(
    `${script}\ntry { run(); 'none' } catch (error) { error === boom ? 'boom' : error }`,
    { boom: new Error('boom') },
  );
}

describe('uselessCatchRecipe', () => {
  it('drops the catch and keeps the finally', () => {
    const text =
      'export function run(): void {\n  try {\n    throw boom;\n  } catch (error) {\n    throw error;\n  } finally {\n    done();\n  }\n}\nfunction done() {}\n';
    const fixed = applied(uselessCatchRecipe, text);

    expect(fixed.text).toBe(
      'export function run(): void {\n  try {\n    throw boom;\n  } finally {\n    done();\n  }\n}\nfunction done() {}\n',
    );
    expect(thrownBy(fixed.text)).toBe(thrownBy(text));
  });

  it('puts the statements of the try block in its place', () => {
    const text =
      'export function run(): void {\n  try {\n    const reason = boom;\n    throw reason;\n  } catch (error) {\n    throw error;\n  }\n}\n';
    const fixed = applied(uselessCatchRecipe, text);

    expect(fixed.text).toBe(
      'export function run(): void {\n  const reason = boom;\n    throw reason;\n}\n',
    );
    expect(thrownBy(fixed.text)).toBe('boom');
    expect(thrownBy(text)).toBe('boom');
  });

  it.each([
    [
      'keeps a block where a declared name is used outside the try',
      'const reason = 1;\nexport function run(): number {\n  try {\n    const reason = 2;\n    return reason;\n  } catch (error) {\n    throw error;\n  }\n}\n',
      'const reason = 1;\nexport function run(): number {\n  {\nconst reason = 2;\n    return reason;\n}\n}\n',
    ],
    [
      'keeps a block where the try is the body of an if',
      'export function run(ready: boolean): void {\n  if (ready) try { go(); stop(); } catch (error) { throw error; }\n}\n',
      'export function run(ready: boolean): void {\n  if (ready) {\ngo(); stop();\n}\n}\n',
    ],
    [
      'deletes a try statement with an empty block',
      'export function run(): void {\n  try {\n  } catch (error) {\n    throw error;\n  }\n}\n',
      'export function run(): void {\n}\n',
    ],
    [
      'keeps a block where flattening would join the next line to the last one',
      'let total = 0\ntry {\n  total = 1\n} catch (error) {\n  throw error\n}\n[1].forEach(log)\nfunction log() {}\n',
      'let total = 0\n{\ntotal = 1\n}\n[1].forEach(log)\nfunction log() {}\n',
    ],
    [
      'keeps a block where flattening would join the first line to the one before',
      'let total = 0\ntry {\n  [total].forEach(log);\n} catch (error) {\n  throw error\n}\nfunction log() {}\n',
      'let total = 0\n{\n[total].forEach(log);\n}\nfunction log() {}\n',
    ],
    [
      'writes an empty block for an empty try that is the body of an if',
      'export function run(ready: boolean): void {\n  if (ready) try {} catch (error) { throw error; }\n  go();\n}\n',
      'export function run(ready: boolean): void {\n  if (ready) {}\n  go();\n}\n',
    ],
  ])('%s', (_name, text, output) => {
    expect(applied(uselessCatchRecipe, text)).toEqual({ text: output, notes: [] });
  });

  it.each([
    [
      'a try with a comment before its block',
      'export function run(): void {\n  try /* guarded */ {\n    go();\n  } catch (error) {\n    throw error;\n  }\n}\n',
    ],
    [
      'a catch with a comment',
      'export function run(): void {\n  try {\n    go();\n  } catch (error) {\n    // keep for now\n    throw error;\n  }\n}\n',
    ],
  ])('leaves %s, with a note', (_name, text) => {
    expect(applied(uselessCatchRecipe, text)).toEqual({
      text,
      notes: [leftNote(2, 'no-useless-catch', 'the catch clause holds a comment')],
    });
  });
});
