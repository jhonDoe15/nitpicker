import { describe, expect, it } from 'vitest';
import { appendReviewSummary, noticeSection } from './notices.mjs';

describe('notice rendering', () => {
  it('renders nothing without notices or policy changes', () => {
    const lines = ['kept'];
    appendReviewSummary(lines, undefined, (text) => text);
    appendReviewSummary(lines, { policyChanges: [], notices: [] }, (text) => text);

    expect(noticeSection()).toEqual([]);
    expect(lines).toEqual(['kept']);
  });

  it('renders a heading and one indented line per notice', () => {
    expect(noticeSection(['one'])).toEqual(['', 'Notices (not failing):', '  one']);
  });

  it('puts the policy changes before the notices, with emphasized headings', () => {
    const lines = [];
    appendReviewSummary(
      lines,
      { policyChanges: ['change'], notices: ['one', 'two'] },
      (text) => `<${text}>`,
    );

    expect(lines).toEqual([
      '<Policy changed in this change (nitpicker.config.json, head against base):>',
      '  change',
      '<Notices (not failing):>',
      '  one',
      '  two',
    ]);
  });
});
