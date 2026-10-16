import { describe, expect, it } from 'vitest';
import { exception, fixtureFindings, rows } from '../facts/test-support/fact-fixtures.mjs';
import { descriptionLines, docCommentProblem } from './doc-comments.mjs';

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

    expect(finding.message).toContain('This doc comment only restates parse_rows.');
    expect(finding.location).toEqual({ line: 3 });
  });

  it('honours an exception', () => {
    const policy = { exceptions: [exception(RULE, 'src/**')] };

    expect(rows(fixtureFindings('doc-comments', [RULE], { policy }))).toEqual([
      [RULE, 'app/legacy.py', 'doc-comment:parse_rows:restating'],
    ]);
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
  ])('%j is %j', (comment, problem) => {
    expect(docCommentProblem(comment)).toEqual(problem);
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
