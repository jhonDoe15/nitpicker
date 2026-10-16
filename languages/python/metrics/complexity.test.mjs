import { afterEach, describe, expect, it } from 'vitest';
import { createMetrics, pythonUsable } from './python-helpers.mjs';

const { field, functionsOf, cleanup } = createMetrics();

afterEach(cleanup);

describe.skipIf(!pythonUsable())('with python3 3.10 or newer on the PATH', () => {
  describe('complexity', () => {
    const complexityOf = (...body) =>
      field(['def f(a, b, c):', ...body.map((line) => `    ${line}`)], 'complexity')[0];

    it('is 1 for a function without a decision', () => {
      expect(complexityOf('return a')).toBe(1);
    });

    it('counts each if and elif, but not else', () => {
      expect(
        complexityOf(
          'if a:',
          '    return 1',
          'elif b:',
          '    return 2',
          'elif c:',
          '    return 3',
          'else:',
          '    return 4',
        ),
      ).toBe(4);
    });

    it('counts each loop and except handler, but not the else of a loop or a try, nor finally', () => {
      expect(complexityOf('for x in a:', '    pass', 'else:', '    pass')).toBe(2);
      expect(complexityOf('while a:', '    pass', 'else:', '    pass')).toBe(2);
      expect(
        complexityOf(
          'try:',
          '    pass',
          'except ValueError:',
          '    pass',
          'except (KeyError, TypeError):',
          '    pass',
          'else:',
          '    pass',
          'finally:',
          '    pass',
        ),
      ).toBe(3);
    });

    it('counts an async for loop and the loop of an async comprehension', () => {
      expect(
        field(
          [
            'async def f(a):',
            '    async for x in a:',
            '        pass',
            '    return [y async for y in a]',
          ],
          'complexity',
        ),
      ).toEqual([3]);
    });

    it('counts each extra operand of and and or', () => {
      expect(complexityOf('return a and b')).toBe(2);
      expect(complexityOf('return a and b and c')).toBe(3);
      expect(complexityOf('return a and b or c')).toBe(3);
      expect(complexityOf('return (a or b) and (b or c)')).toBe(4);
    });

    it('counts a conditional expression, and an if with a boolean operator twice', () => {
      expect(complexityOf('return a if b else c')).toBe(2);
      expect(complexityOf('if a and b:', '    return 1')).toBe(3);
    });

    it('counts the loop and each condition of a comprehension, in a lambda too', () => {
      expect(complexityOf('return [x for x in a if x if b]')).toBe(4);
      expect(complexityOf('return {x: y for x in a for y in b}')).toBe(3);
      expect(complexityOf('return (x for x in a)')).toBe(2);
      expect(complexityOf('return lambda x: x if a else b')).toBe(2);
    });

    it('counts each case of a match but a wildcard without a guard, like default in a switch', () => {
      expect(
        complexityOf(
          'match a:',
          '    case 1:',
          '        pass',
          '    case 2 | 3:',
          '        pass',
          '    case _:',
          '        pass',
        ),
      ).toBe(3);
      expect(
        complexityOf(
          'match a:',
          '    case 1:',
          '        pass',
          '    case x if x > b:',
          '        pass',
          '    case _ if c:',
          '        pass',
        ),
      ).toBe(4);
    });

    it('leaves nested functions and classes to their own entries', () => {
      const metrics = functionsOf([
        'def outer(a):',
        '    def inner(b):',
        '        if b:',
        '            return 1',
        '        return 0',
        '',
        '    class Local:',
        '        def method(self, c):',
        '            return c and a',
        '',
        '    return inner(a) if a else Local',
      ]);

      expect(metrics.map(({ name, complexity }) => [name, complexity])).toEqual([
        ['outer', 2],
        ['outer.inner', 2],
        ['outer.Local.method', 2],
      ]);
    });
  });
});
