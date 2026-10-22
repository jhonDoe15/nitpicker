import { describe, expect, it } from 'vitest';
import { noticeDescriber } from './notices.mjs';
import { outsideRootsNotices } from '../../../languages/typescript/preset/notices/outside-roots-notice.mjs';

const changed = ['scripts/slop.ts', 'src/a.ts'];

describe('noticeDescriber', () => {
  it('describes changed TypeScript files outside the roots for the TypeScript preset', () => {
    const expected = outsideRootsNotices(changed, {});

    expect(expected).toHaveLength(1);
    expect(noticeDescriber({}, {})?.(changed)).toEqual(expected);
    expect(noticeDescriber({ preset: 'typescript' }, {})?.(changed)).toEqual(expected);
  });

  it('uses the head policy of the project', () => {
    const describeExcluded = noticeDescriber({}, { exclude: ['scripts/**'] });

    expect(describeExcluded?.(changed)).toEqual([]);
  });

  it('describes nothing for the other presets', () => {
    for (const preset of ['javascript', 'python', 'java', 'kotlin']) {
      expect(noticeDescriber({ preset }, {})).toBeUndefined();
    }
  });
});
