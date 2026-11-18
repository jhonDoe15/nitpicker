import { describe, expect, it } from 'vitest';
import {
  OPAQUE,
  queryProblemMessage as untypedMessage,
  queryTextProblem as untypedProblem,
  runTogether as untypedTogether,
} from './query-text.mjs';

type Problem = { readonly kind: string; readonly snippet?: string } | undefined;

const problem: (text: string, options: { complete: boolean }) => Problem = untypedProblem;
const together: (left: string, right: string) => Problem = untypedTogether;
const message: (found: unknown) => string = untypedMessage;

describe('queryTextProblem', () => {
  it('finds an operator with no operand', () => {
    expect(problem(' AND group_id LIKE ', { complete: true })?.kind).toBe('operand');
    expect(problem('SELECT * FROM t WHERE a = ', { complete: true })?.kind).toBe('operand');
    expect(problem('SELECT * FROM t WHERE a = AND b = 1', { complete: false })?.kind).toBe(
      'operand',
    );
    expect(problem('SELECT * FROM t WHERE a IN ', { complete: true })?.kind).toBe('operand');
  });

  it('accepts operators followed by a value, a placeholder or more text', () => {
    expect(problem(' AND group_id LIKE ? ', { complete: true })).toBeUndefined();
    expect(problem(`SELECT * FROM t WHERE a = ${OPAQUE}`, { complete: true })).toBeUndefined();
    expect(problem('SELECT * FROM t WHERE a = ', { complete: false })).toBeUndefined();
    expect(problem('SELECT a >= 1 FROM t', { complete: true })).toBeUndefined();
    expect(problem('hello world =', { complete: true })).toBeUndefined();
    const prose = 'where criteria is being ignored as this version of the library is too old =';
    expect(problem(prose, { complete: true })).toBeUndefined();
  });

  it('compares the columns and values of an insert', () => {
    const text = 'INSERT INTO lock_table (a, b, c) VALUES (?, ?)';
    expect(problem(text, { complete: true })).toMatchObject({
      kind: 'count',
      columns: 3,
      values: 2,
    });
    expect(problem('INSERT INTO t (a, b) VALUES (?, now())', { complete: true })).toBeUndefined();
    expect(problem('INSERT INTO t (a, b) VALUES (?, f(?, ?))', { complete: true })).toBeUndefined();
    expect(
      problem("INSERT INTO t (a, b) VALUES ('[1,2]', '(x), y')", { complete: true }),
    ).toBeUndefined();
    expect(problem(`INSERT INTO t (a, b) VALUES (${OPAQUE})`, { complete: true })).toBeUndefined();
  });
});

describe('runTogether', () => {
  it('finds a keyword glued to a neighbour', () => {
    expect(together('SELECT * FROM t', 'WHERE a = ?')?.kind).toBe('joined');
    expect(together('if x then', "redis.call('get')")?.kind).toBe('joined');
    expect(together('SELECT * FROM t WHERE', 'a = ?')?.kind).toBe('joined');
  });

  it('accepts a space on either side and unrelated words', () => {
    expect(together('SELECT * FROM t ', 'WHERE a = ?')).toBeUndefined();
    expect(together('SELECT * FROM t', ' WHERE a = ?')).toBeUndefined();
    expect(together('SELECT * FROM t_', 'users')).toBeUndefined();
    expect(together('user', 'name')).toBeUndefined();
  });

  it('formats a message that shows the text', () => {
    expect(message({ kind: 'joined', snippet: 'tWHERE' })).toContain('tWHERE');
  });
});
