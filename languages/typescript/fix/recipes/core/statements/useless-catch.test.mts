import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { ts } from '../../../../preset/eslint-plugin/rules/typed/typescript-views.mts';
import { applied } from '../test-support/apply-recipe.mts';
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

  it('keeps a block where a declared name is used outside the try', () => {
    const text =
      'const reason = 1;\nexport function run(): number {\n  try {\n    const reason = 2;\n    return reason;\n  } catch (error) {\n    throw error;\n  }\n}\n';

    expect(applied(uselessCatchRecipe, text).text).toBe(
      'const reason = 1;\nexport function run(): number {\n  {\nconst reason = 2;\n    return reason;\n}\n}\n',
    );
  });

  it('keeps a block where the try is the body of an if', () => {
    const text =
      'export function run(ready: boolean): void {\n  if (ready) try { go(); stop(); } catch (error) { throw error; }\n}\n';

    expect(applied(uselessCatchRecipe, text).text).toBe(
      'export function run(ready: boolean): void {\n  if (ready) {\ngo(); stop();\n}\n}\n',
    );
  });

  it('deletes a try statement with an empty block', () => {
    const text =
      'export function run(): void {\n  try {\n  } catch (error) {\n    throw error;\n  }\n}\n';

    expect(applied(uselessCatchRecipe, text).text).toBe('export function run(): void {\n}\n');
  });

  it('leaves a catch with a comment, with a note', () => {
    const text =
      'export function run(): void {\n  try {\n    go();\n  } catch (error) {\n    // keep for now\n    throw error;\n  }\n}\n';
    const fixed = applied(uselessCatchRecipe, text);

    expect(fixed.text).toBe(text);
    expect(fixed.notes).toEqual([
      expect.stringContaining('eslint/no-useless-catch: the catch clause holds a comment'),
    ]);
  });
});
