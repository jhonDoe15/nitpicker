import { describe, expect, it } from 'vitest';
import {
  bodyLines,
  firstCommentedOutCodeLine,
  unreferencedWorkTagLines,
} from './comment-checks.mjs';
import { taskMarkerCases } from '../naming/test-support/task-marker-cases.mjs';

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
    ['todo: lower case', []],
    ['A todo list component', []],
    ['Todo item stored per user.', []],
    ['Todo items are sorted by due date.', []],
    ['Formats a phone number as XXX-XXX-XXXX.', []],
    ['XXX-XXX-XXXX is the phone format', []],
    ['Keys look like XXX.XXX or XXX/XXX here', []],
    ['This is a HACK until the parser is fixed', []],
    ['Remove after migration, TODO: drop the column', [0]],
    ['Remove after migration, FIXME(#7) drop the column', []],
    ['Remove after migration, HACK(ORD-3)', []],
    ['Wait for the HACK: parser fix', [0]],
    ['TODO SHA-256 hashing', [0]],
    ['TODO(UTF-8) decoding', [0]],
    ['TODO: fix this, see #12', [0]],
    ['TODO(ORD-42) fix', []],
    ['TODO #12 fix', []],
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

  it.each(
    [true, false].flatMap((reported) =>
      taskMarkerCases('typescript', reported).map((row) => [row.name, row.text, reported]),
    ),
  )('judges %s as the shared task marker table does', (_name, text, reported) => {
    expect(unreferencedWorkTagLines(text.split('\n')).length > 0).toBe(reported);
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
    'const value = load();',
    'total++;',
    'List<String> names = new ArrayList<>();',
    'export function oldImplementation(x) {',
    'public void run() {',
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
    '}',
    '});',
    'Call this once per request; it caches',
    'the cache is cleared on restart;',
    'Rounds half up, see the pricing rules;',
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
