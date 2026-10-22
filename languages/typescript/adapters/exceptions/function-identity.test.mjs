import { describe, expect, it } from 'vitest';
import { functionIdentity } from './function-identity.mjs';

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
    expect(
      functionIdentity(SOURCE, 'src/a.ts').crapFunctionName({ lines: { start: 2, end: 4 } }),
    ).toBe('Store.save');
    expect(
      functionIdentity(SOURCE, 'src/a.ts').crapFunctionName({ lines: { start: 6, end: 6 } }),
    ).toBe('arrow');
    expect(
      functionIdentity(SOURCE, 'src/a.ts').crapFunctionName({ lines: { start: 7, end: 7 } }),
    ).toBeUndefined();
  });

  it('attributes each branch to the narrowest unit that holds it, and a module-level one to none', () => {
    const branchMap = {
      0: { loc: { start: { line: 3 } } },
      1: { loc: { start: { line: 6 } } },
      2: { loc: { start: { line: 7 } } },
    };

    expect(functionIdentity(SOURCE, 'src/a.ts').branchFunctionNames(branchMap)).toEqual({
      0: 'Store.save',
      1: 'arrow',
      2: undefined,
    });
  });

  it('finds the function that holds a mutant line', () => {
    expect(functionIdentity(SOURCE, 'src/a.ts').functionNameAtLine(3)).toBe('Store.save');
    expect(functionIdentity(SOURCE, 'src/a.ts').functionNameAtLine(7)).toBeUndefined();
  });

  it('reads JSX and JavaScript files', () => {
    expect(
      functionIdentity(
        'export const View = () => <b>{a ? 1 : 2}</b>;',
        'src/View.tsx',
      ).functionNameAtLine(1),
    ).toBe('View');
    expect(functionIdentity('function f() { return 1; }', 'src/f.mjs').functionNameAtLine(1)).toBe(
      'f',
    );
  });
});
