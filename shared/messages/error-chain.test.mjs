import { describe, expect, it } from 'vitest';
import { describeError } from './error-chain.mjs';

describe('describeError', () => {
  it('prints a plain error or a thrown value as its message', () => {
    expect(describeError(new Error('No base could be determined'))).toBe(
      'No base could be determined',
    );
    expect(describeError('stopped')).toBe('stopped');
  });

  it('prints each cause in the chain on its own line, first line only', () => {
    const git = new Error("error: failed to delete '/tmp/head': Directory not empty\nhint: retry");
    const wrapper = new Error('Failed to remove the temporary worktree', {
      cause: new Error('git worktree remove failed', { cause: git }),
    });

    expect(describeError(wrapper)).toBe(
      [
        'Failed to remove the temporary worktree',
        '  caused by: git worktree remove failed',
        "  caused by: error: failed to delete '/tmp/head': Directory not empty",
      ].join('\n'),
    );
  });

  it('prints every inner error of an AggregateError', () => {
    const error = new AggregateError(
      [new Error('java timed out after 60000 ms'), new Error('Directory not empty')],
      'Quality comparison and temporary worktree cleanup both failed',
    );

    expect(describeError(error)).toBe(
      [
        'Quality comparison and temporary worktree cleanup both failed',
        '  caused by: java timed out after 60000 ms',
        '  caused by: Directory not empty',
      ].join('\n'),
    );
  });

  it('skips a cause the message already contains and still prints its own cause', () => {
    const parse = new SyntaxError('Unexpected token } in JSON at position 4');
    const read = new Error('cannot read config.json', { cause: parse });
    const error = new Error('nitpicker.config.json: cannot read config.json', { cause: read });

    expect(describeError(error)).toBe(
      [
        'nitpicker.config.json: cannot read config.json',
        '  caused by: Unexpected token } in JSON at position 4',
      ].join('\n'),
    );
  });

  it('ignores a null cause, reads a plain object message and drops an empty message', () => {
    expect(describeError(new Error('wrapper', { cause: null }))).toBe('wrapper');
    expect(describeError(new Error('wrapper', { cause: { message: 'inner' } }))).toBe(
      'wrapper\n  caused by: inner',
    );
    expect(describeError(new Error('', { cause: new Error('inner') }))).toBe('  caused by: inner');
  });

  it('prints at most ten causes of an AggregateError', () => {
    const members = Array.from({ length: 12 }, (_, index) => new Error(`member ${String(index)}`));

    expect(describeError(new AggregateError(members, 'all failed')).split('\n')).toEqual([
      'all failed',
      ...members.slice(0, 10).map(({ message }) => `  caused by: ${message}`),
      '  ... and 2 more causes',
    ]);
  });

  it('stops after three levels of causes', () => {
    const chain = ['d', 'c', 'b', 'a'].reduce(
      (cause, name) => new Error(`level ${name}`, { cause }),
      new Error('level e'),
    );

    expect(describeError(chain).split('\n')).toEqual([
      'level a',
      '  caused by: level b',
      '  caused by: level c',
      '  caused by: level d',
    ]);
  });
});
