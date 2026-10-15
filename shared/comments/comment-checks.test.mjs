import { describe, expect, it } from 'vitest';
import {
  bodyLines,
  firstCommentedOutCodeLine,
  unreferencedWorkTagLines,
} from './comment-checks.mjs';

describe('bodyLines', () => {
  it('drops the leading asterisks of a block comment and trims each line', () => {
    expect(bodyLines('*\n * First line\n   * Second line\n ')).toEqual([
      '',
      'First line',
      'Second line',
      '',
    ]);
  });
});

describe('unreferencedWorkTagLines', () => {
  it.each([
    ['TODO: fix this later', [0]],
    ['fixme handle null', []],
    ['FIXME handle null', [0]],
    ['XXX revisit', [0]],
    ['HACK around the parser', [0]],
    ['TODO(#12): fix this later', []],
    ['TODO PROJ-123 fix this later', []],
    ['TODO https://example.com/issues/4 fix', []],
    ['TODOS are tracked elsewhere', []],
    ['nothing to do here', []],
  ])('%s', (line, expected) => {
    expect(unreferencedWorkTagLines([line])).toEqual(expected);
  });

  it('judges each line on its own', () => {
    expect(unreferencedWorkTagLines(['TODO #4 first', 'TODO second'])).toEqual([1]);
  });
});

describe('firstCommentedOutCodeLine', () => {
  it.each([
    'int total = compute(items);',
    'logger.info("started");',
    'return value;',
    'import java.util.List;',
    'if (count > 1) {',
    'for (const item of items) {',
    '} else {',
    '} catch (Exception e) {',
    '}',
    '});',
    'const value = load();',
    'break;',
  ])('flags the code line %s', (line) => {
    expect(firstCommentedOutCodeLine([line])).toBe(0);
  });

  it.each([
    'Returns the total price of the order.',
    'Calls the service; then returns the result',
    'The retry count is 3; see the retry policy.',
    'Set the timeout to 5 seconds;',
    'e.g. use foo(bar) here',
    '',
    'The {@code if (x) {} } form is allowed',
  ])('keeps the prose line %s', (line) => {
    expect(firstCommentedOutCodeLine([line])).toBe(-1);
  });

  it('reports the index of the first code line', () => {
    expect(firstCommentedOutCodeLine(['Old version:', 'int a = 1;', 'int b = 2;'])).toBe(1);
  });

  it('ignores code in an @example block, a fenced block and a pre block', () => {
    const lines = [
      '@example',
      'const a = load();',
      '@param value the input',
      '```ts',
      'const b = load();',
      '```',
      '<pre>',
      'int c = load();',
      '</pre>',
    ];
    expect(firstCommentedOutCodeLine(lines)).toBe(-1);
  });

  it('flags code after an @example block ends', () => {
    expect(firstCommentedOutCodeLine(['@example', 'a();', '@returns x', 'b();'])).toBe(3);
  });
});
