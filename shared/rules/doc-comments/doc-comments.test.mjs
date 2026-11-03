import { describe, expect, it } from 'vitest';
import { exceptionHint } from '../exceptions.mjs';
import {
  exception,
  findingsOf,
  fixtureFindings,
  rows,
} from '../facts/test-support/fact-fixtures.mjs';
import { descriptionLines, docCommentProblem, tagsHaveContent } from './doc-comments.mjs';

const RULE = 'doc-comment-content';

describe('doc-comment-content over facts', () => {
  it('reports a restating comment and a long one, in any language', () => {
    expect(rows(fixtureFindings('doc-comments', [RULE]))).toEqual([
      [RULE, 'app/legacy.py', 'doc-comment:parse_rows:restating'],
      [RULE, 'src/main/java/com/acme/Orders.java', 'doc-comment:getOrderTotal:restating'],
      [RULE, 'src/main/java/com/acme/Orders.java', 'doc-comment:reconcile:long'],
    ]);
  });

  it('says how to fix it and where the finding is', () => {
    const [finding] = fixtureFindings('doc-comments', [RULE]);

    expect(finding.message).toBe(
      `This doc comment only restates parse_rows. Delete it, or say what the name cannot: a unit, a limit, an edge case or why. ${exceptionHint(RULE, 'app/legacy.py')}`,
    );
    expect(finding.location).toEqual({ line: 3 });
  });

  it('honours an exception', () => {
    const policy = { exceptions: [exception(RULE, 'src/**')] };

    expect(rows(fixtureFindings('doc-comments', [RULE], { policy }))).toEqual([
      [RULE, 'app/legacy.py', 'doc-comment:parse_rows:restating'],
    ]);
  });
});

describe('doc-comment-content identity', () => {
  it('keeps two same-named comments in one file apart by qualifier', () => {
    const comment = { file: 'app/Money.java', name: 'of', lines: ['Of.'] };
    const docComments = [
      { ...comment, line: 3, qualifier: 'Money.of(int)' },
      { ...comment, line: 9, qualifier: 'Money.of(long)' },
    ];

    expect(rows(findingsOf({ docComments }, [RULE]))).toEqual([
      [RULE, 'app/Money.java', 'doc-comment:Money.of(int):restating'],
      [RULE, 'app/Money.java', 'doc-comment:Money.of(long):restating'],
    ]);
  });

  it('reads an inline tag in linear time', () => {
    const lines = [`${'{@a'.repeat(50_000)} x`];
    const started = performance.now();

    expect(docCommentProblem({ name: 'x', lines })).toEqual({ kind: 'restating', name: 'x' });
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('doc-comment content', () => {
  it.each([
    [
      { name: 'orderId', lines: ['The order id.'] },
      { kind: 'restating', name: 'orderId' },
    ],
    [{ name: 'orderId', lines: ['Unique within one shop only.'] }, undefined],
    [{ name: 'x', lines: ['1', '2', '3', '4', '5'] }, undefined],
    [
      { name: 'x', lines: ['1', '2', '3', '4', '5', '6'] },
      { kind: 'long', lines: 6, limit: 5 },
    ],
    [
      { name: 'formatPrice', lines: ['Formats the {@link price}.'] },
      { kind: 'restating', name: 'formatPrice' },
    ],
    [
      { name: 'Order', lines: ['Order class.'] },
      { kind: 'restating', name: 'Order' },
    ],
    [
      { name: 'x', lines: ['1', '```ts', 'a();', 'b();', 'c();', 'd();'] },
      { kind: 'long', lines: 6, limit: 5 },
    ],
    [{ name: 'x', lines: ['1', '```ts', 'a();', 'b();', 'c();', 'd();', '```', '2'] }, undefined],
    [
      { name: 'x', lines: ['1', '~~~', 'a();', '@param b', 'c();', '~~~', '2', '3', '4'] },
      undefined,
    ],
    [{ name: 'x', lines: ['1', '2', '3', '4', '@example', 'a();', 'b();', 'c();'] }, undefined],
    [
      { name: 'x', lines: ['1', '@example', 'a();', '@see y', '2', '3', '4', '5', '6'] },
      { kind: 'long', lines: 6, limit: 5 },
    ],
    [
      { name: 'x', lines: ['1', '```', 'a();', '```', '2', '- 3', '- 4', '* 5', '6'] },
      { kind: 'long', lines: 6, limit: 5 },
    ],
    [{ name: 'orderId', lines: ['The order id.'], detailed: true }, undefined],
    [
      { name: 'orderId', lines: ['The order id.'], detailed: false },
      { kind: 'restating', name: 'orderId' },
    ],
    [
      { name: 'x', lines: ['1', '2', '3', '4', '5', '6'], detailed: true },
      { kind: 'long', lines: 6, limit: 5 },
    ],
  ])('%j is %j', (comment, problem) => {
    expect(docCommentProblem(comment)).toEqual(problem);
  });

  it.each([
    ['@param id the account', true],
    ['@param {string} id', false],
    ['@param [id=1] -', false],
    ['@param <T> the element type', true],
    ['@returns {string}', false],
    ['@return the user, never null', true],
    ['@throws {RangeError}', false],
    ['@throws IOException', false],
    ['@throws IOException when the file is gone', true],
    ['@throws {RangeError} for a negative id', true],
    ['@returns {{ id: string }}', false],
    ['@deprecated', false],
    ['@returns\n  the display name', true],
    ['```\n@param x the kept example\n```', false],
    ['the account id', false],
    ['@author Ada\n@since 1.2\n@version 3\n@see Order\n  and Cart', false],
    ['@see Order\n@return the user, never null', true],
  ])('finds tag content in %j: %s', (text, detailed) => {
    const javadoc = { blockTag: /^@[A-Za-z][\w-]*(?=[\s{]|$)/u };

    expect(tagsHaveContent(`Loads the user.\n${text}`, javadoc)).toBe(detailed);
  });

  it('cuts at a block tag after a fence that is never closed', () => {
    const text = ['Sums the rows.', '```', 'a();', ':param rows: the rows', 'more'].join('\n');

    expect(descriptionLines(text, { blockTag: /^:param\b/u })).toEqual([
      'Sums the rows.',
      '```',
      'a();',
    ]);
  });

  it('cuts the description at the first block tag, outside code fences', () => {
    const text = [
      'Sums the rows.',
      '```',
      ':param x: kept',
      '```',
      '',
      ':param rows: the rows',
    ].join('\n');

    expect(descriptionLines(text, { blockTag: /^:param\b/u })).toEqual([
      'Sums the rows.',
      '```',
      ':param x: kept',
      '```',
    ]);
  });
});
