import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-operand-slip.mjs';

const tester = typescriptRuleTester();

function error(messageId, data) {
  return data === undefined ? { messageId } : { messageId, data };
}

tester.run('no-operand-slip', rule, {
  valid: [
    'a === b',
    'a.b === a.c',
    'next() === next()',
    'Math.random() === Math.random()',
    'items[index++] === items[index++]',
    '0 / 0',
    'a && b',
    'ready && load() && ready',
    'x > 3 && x < 5',
    'x > 3 && x < 4',
    'x < 3 || x > 5',
    'x === 1 || x === 2',
    "x === 'a' || x === 'b'",
    "x !== 'a' && x !== 'b'",
    'x >= 5 && x <= 5',
    'x > 3 && y > 5',
    'const value = !!a || a;',
    'const value = a ?? a;',
    'a - b',
    'x * 2',
    '1 * 0',
    'total += price',
    'total += price + tax',
    'total -= price - total',
    'total = total + price',
    'if (user.active || user.admin) {}',
    'if (x > 1e308 && x < 1.7e308) {}',
    'if (x > -1.7e308 && x < -1.5e308) {}',
    'if (x > 1e20 && x <= 1e20 + 4096) {}',
    'const zero = load() * 0;',
    'x < 3 && load() && x > 5',
  ],
  invalid: [
    {
      code: 'if (element.endArrowhead || element.endArrowhead) {}',
      errors: [error('repeatedOperand', { operand: 'element.endArrowhead', operator: '||' })],
    },
    {
      code: 'const same = a.b === c && c === a.b;',
      errors: [error('repeatedOperand', { operand: 'c === a.b', operator: '&&' })],
    },
    {
      code: 'if (!(x && y) || !x) {}',
      errors: [error('repeatedOperand', { operand: '!x', operator: '||' })],
    },
    { code: 'if (!!a || a) {}', errors: [error('repeatedOperand')] },
    { code: 'const ok = a.ready && b && a.ready;', errors: [error('repeatedOperand')] },
    { code: 'if (x !== x) {}', errors: [error('nanTest', { operand: 'x', operator: '!==' })] },
    { code: 'const big = a < a;', errors: [error('sameOperand', { operand: 'a', operator: '<' })] },
    { code: 'const none = row.total - row.total;', errors: [error('sameOperand')] },
    { code: 'const one = (size as number) / size;', errors: [error('sameOperand')] },
    { code: 'if (x < 3 && x > 5) {}', errors: [error('impossible', { operator: '&&' })] },
    { code: 'if (x > -1 && x < -5) {}', errors: [error('impossible')] },
    { code: "if (kind === 'a' && kind === 'b') {}", errors: [error('impossible')] },
    {
      code: 'if (x > 5 && x > 3) {}',
      errors: [error('implied', { redundant: 'x > 3', deciding: 'x > 5' })],
    },
    {
      code: 'if (x === 1 || x >= 1) {}',
      errors: [error('covered', { redundant: 'x === 1', deciding: 'x >= 1' })],
    },
    { code: 'if (x !== 1 || x !== 2) {}', errors: [error('always', { operator: '||' })] },
    {
      code: 'const nothing = count * 0;',
      errors: [error('erasingOperation', { operand: 'count', operator: '*' })],
    },
    { code: 'const none = 0 & flags;', errors: [error('erasingOperation')] },
    {
      code: 'total += total + price;',
      errors: [error('misrefactoredAssignment', { target: 'total', operator: '+' })],
    },
    {
      code: 'total *= price * total;',
      errors: [error('misrefactoredAssignment', { target: 'total', operator: '*' })],
    },
    { code: 'total += total + price + tax;', errors: [error('misrefactoredAssignment')] },
    { code: 'ready ||= ready || loaded;', errors: [error('misrefactoredAssignment')] },
    { code: 'const none = size * 0n;', errors: [error('erasingOperation')] },
    {
      code: 'const none = (a + b) * 0;',
      errors: [error('erasingOperation', { operand: '(a + b)', operator: '*' })],
    },
    { code: 'if (a % 2 === 0 && a % 2 === 1) {}', errors: [error('impossible')] },
    { code: 'if (x < 3 && x > 5 && x === 4) {}', errors: [error('impossible')] },
    { code: 'const same = a % b - a % b;', errors: [error('sameOperand')] },
    {
      code: 'const same = typeof a === typeof a;',
      errors: [error('sameOperand', { operand: 'typeof a', operator: '===' })],
    },
    {
      code: 'if (x === 1 || x === 1.0) {}',
      errors: [error('repeatedOperand', { operand: 'x === 1.0', operator: '||' })],
    },
  ],
});
