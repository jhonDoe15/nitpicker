import { describe, expect, it } from 'vitest';
import { noticeSection, reviewSummaryLines } from './notices.mts';

describe('notice rendering', () => {
  it('renders nothing without notices', () => {
    const lines = [
      'kept',
      ...reviewSummaryLines(undefined, (text) => text),
      ...reviewSummaryLines({ notices: [] }, (text) => text),
    ];

    expect(noticeSection()).toEqual([]);
    expect(lines).toEqual(['kept']);
  });

  it('renders a heading and one indented line per notice', () => {
    expect(noticeSection(['one'])).toEqual(['', 'Notices (not failing):', '  one']);
  });

  it('emphasizes the heading of the notices in a review summary', () => {
    const lines = reviewSummaryLines({ notices: ['one', 'two'] }, (text) => `<${text}>`);

    expect(lines).toEqual(['<Notices (not failing):>', '  one', '  two']);
  });
});
