import { describe, expect, it } from 'vitest';
import { appendNoticeSummary, noticeSection } from './notices.mjs';

describe('notice rendering', () => {
  it('renders nothing without notices', () => {
    const lines = ['kept'];
    appendNoticeSummary(lines, undefined, (text) => text);

    expect(noticeSection()).toEqual([]);
    expect(lines).toEqual(['kept']);
  });

  it('renders a heading and one indented line per notice', () => {
    const lines = [];
    appendNoticeSummary(lines, ['one', 'two'], (text) => `<${text}>`);

    expect(noticeSection(['one'])).toEqual(['', 'Notices (not failing):', '  one']);
    expect(lines).toEqual(['<Notices (not failing):>', '  one', '  two']);
  });
});
