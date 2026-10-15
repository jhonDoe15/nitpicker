import { describe, expect, it } from 'vitest';
import { branchFunctionNames, crapFunctionName, functionNameAtLine } from './function-identity.mjs';

const SOURCE = [
  'class Store {',
  '  save(a: number) {',
  '    return a > 0 ? 1 : 2;',
  '  }',
  '}',
  'const arrow = (a: number) => (a ? 1 : 2);',
  'export const top = flag ? 1 : 2;',
].join('\n');

describe('the function identity of a TypeScript source', () => {
  it('finds the function a CRAP entry measures by its lines', () => {
    expect(crapFunctionName(SOURCE, 'src/a.ts', { lines: { start: 2, end: 4 } })).toBe(
      'Store.save',
    );
    expect(crapFunctionName(SOURCE, 'src/a.ts', { lines: { start: 6, end: 6 } })).toBe('arrow');
    expect(crapFunctionName(SOURCE, 'src/a.ts', { lines: { start: 7, end: 7 } })).toBeUndefined();
  });

  it('attributes each branch to the narrowest unit that holds it, and a module-level one to none', () => {
    const branchMap = {
      0: { loc: { start: { line: 3 } } },
      1: { loc: { start: { line: 6 } } },
      2: { loc: { start: { line: 7 } } },
    };

    expect(branchFunctionNames(SOURCE, 'src/a.ts', branchMap)).toEqual({
      0: 'Store.save',
      1: 'arrow',
      2: undefined,
    });
  });

  it('finds the function that holds a mutant line', () => {
    expect(functionNameAtLine(SOURCE, 'src/a.ts', 3)).toBe('Store.save');
    expect(functionNameAtLine(SOURCE, 'src/a.ts', 7)).toBeUndefined();
  });

  it('reads JSX and JavaScript files', () => {
    expect(
      functionNameAtLine('export const View = () => <b>{a ? 1 : 2}</b>;', 'src/View.tsx', 1),
    ).toBe('View');
    expect(functionNameAtLine('function f() { return 1; }', 'src/f.mjs', 1)).toBe('f');
  });
});
