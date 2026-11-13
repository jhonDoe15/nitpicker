import { describe, expect, it } from 'vitest';
import { parseAnalyzerReport, parseFinding } from '../finding-schema.mjs';
import { findingsSchemaErrors } from '../test-support/findings-schema-check.mjs';

const VALID = {
  tool: 'checkstyle',
  rule: 'UpperEll',
  path: 'src/A.java',
  identity: 'id',
  message: 'message',
  classification: 'enforceable',
  location: { line: 1 },
};
const SHA = 'a'.repeat(64);
const FIX = {
  recipe: 'java-upper-ell',
  safety: 'safe',
  path: 'src/A.java',
  sha256: SHA,
  textLength: 12,
  edits: [{ type: 'replace', path: 'src/A.java', start: 9, end: 10, text: 'L' }],
};

describe('the fix field of a finding', () => {
  it.each([
    ['edits', FIX],
    ['a whole-file write', { ...FIX, edits: [{ type: 'write', path: 'src/A.java', text: 'x' }] }],
    ['only a recipe and safety', { recipe: 'java-upper-ell', safety: 'review' }],
  ])('is accepted with %s', (_name, fix) => {
    const finding = { ...VALID, fix };

    expect(parseFinding(finding).fix).toEqual(fix);
    expect(findingsSchemaErrors([finding])).toEqual([]);
  });

  it('keeps a finding without a fix valid', () => {
    expect(parseFinding(VALID).fix).toBeUndefined();
    expect(findingsSchemaErrors([VALID])).toEqual([]);
  });

  it('passes the fix of an ingested analyzer report through unchanged', () => {
    const report = parseAnalyzerReport({ findings: [{ ...VALID, fix: FIX }] }, 'fixture');

    expect(report.findings[0].fix).toEqual(FIX);
  });

  it.each([
    ['an unknown safety', { ...FIX, safety: 'risky' }, '/findings/0/fix/safety'],
    ['no recipe', { safety: 'safe' }, '/findings/0/fix'],
    ['an empty edit list', { ...FIX, edits: [] }, '/findings/0/fix/edits'],
    [
      'a replace without offsets',
      { ...FIX, edits: [{ type: 'replace', path: 'a', text: 'L' }] },
      '/findings/0/fix/edits/0',
    ],
    [
      'a move edit',
      { ...FIX, edits: [{ type: 'move', path: 'a', text: '' }] },
      '/findings/0/fix/edits/0/type',
    ],
    [
      'a negative offset',
      { ...FIX, edits: [{ type: 'replace', path: 'a', start: -1, end: 0, text: '' }] },
      '/findings/0/fix/edits/0/start',
    ],
    ['a bad hash', { ...FIX, sha256: 'xyz' }, '/findings/0/fix/sha256'],
    ['an extra field', { ...FIX, extra: 1 }, '/findings/0/fix'],
  ])('rejects %s like the reference parser', (_name, fix, errorPath) => {
    const finding = { ...VALID, fix };

    expect(() => parseFinding(finding)).toThrow(TypeError);
    expect(findingsSchemaErrors([finding])[0].split(' ')[2]).toBe(errorPath);
  });
});
