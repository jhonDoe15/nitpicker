import { describe, expect, it } from 'vitest';
import { clonePartnerPath, evaluateDuplicates } from './duplicates.mjs';

describe('clonePartnerPath', () => {
  it('names the other file of the pair for a clone and its size metrics', () => {
    const findings = evaluateDuplicates(
      [
        {
          first: { file: 'b|c:d.java', line: 8 },
          second: { file: 'a.java', line: 3 },
          fragment: 'x',
          lines: 6,
          tokens: 60,
        },
      ],
      'duplicates',
    );

    expect(findings.map((finding) => [finding.path, clonePartnerPath(finding)])).toEqual([
      ['a.java', 'b|c:d.java'],
      ['a.java', 'b|c:d.java'],
      ['a.java', 'b|c:d.java'],
    ]);
  });

  it('has no partner for other findings', () => {
    expect(
      clonePartnerPath({ rule: 'duplicate-clone', path: 'a.java', identity: 'something' }),
    ).toBeUndefined();
    expect(
      clonePartnerPath({
        rule: 'other',
        path: 'a.java',
        identity: 'pair:a.java|b.java:fragment:x',
      }),
    ).toBeUndefined();
    expect(
      clonePartnerPath({ rule: 'duplicate-clone', path: 'a.java', identity: 'pair:a.java|b.java' }),
    ).toBeUndefined();
  });
});
