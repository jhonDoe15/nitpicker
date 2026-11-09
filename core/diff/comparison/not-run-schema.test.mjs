import { describe, expect, it } from 'vitest';
import { parseFinding } from './finding-schema.mjs';
import { findingsSchemaErrors } from './test-support/findings-schema-check.mjs';

const VALID = {
  tool: 'tool',
  rule: 'rule',
  path: 'src/a.ts',
  identity: 'id',
  message: 'message',
  classification: 'enforceable',
};
const DESCRIPTIVE = { ...VALID, classification: 'descriptive' };
const NOT_RUN = { ...DESCRIPTIVE, toolNotRun: true };

const MALFORMED = [
  [{ ...VALID, toolNotRun: true }, '/findings/0/classification'],
  [{ ...DESCRIPTIVE, toolNotRun: false }, '/findings/0/toolNotRun'],
  [{ ...DESCRIPTIVE, notRunScope: ['core'] }, '/findings/0'],
  [{ ...NOT_RUN, notRunScope: [] }, '/findings/0/notRunScope'],
  [{ ...NOT_RUN, notRunScope: [''] }, '/findings/0/notRunScope/0'],
  [{ ...NOT_RUN, notRunScope: 'core' }, '/findings/0/notRunScope'],
  [{ ...DESCRIPTIVE, notRunIdentityPrefix: 'cpd:' }, '/findings/0'],
  [{ ...NOT_RUN, notRunIdentityPrefix: '' }, '/findings/0/notRunIdentityPrefix'],
  [{ ...NOT_RUN, notRunIdentityPrefix: 1 }, '/findings/0/notRunIdentityPrefix'],
];

describe('tool-not-run notices and kept line ranges in the findings schema', () => {
  it.each(MALFORMED)(
    'rejects the malformed finding %j like the reference parser',
    (finding, errorPath) => {
      expect(() => parseFinding(finding)).toThrow(TypeError);
      expect(findingsSchemaErrors([finding])[0]).toContain(`tool rule: ${errorPath} `);
    },
  );

  it('accepts line ranges a held finding must keep unchanged and rejects a reversed one', () => {
    const finding = {
      ...VALID,
      tool: 'duplicates',
      rule: 'duplicate-clone',
      path: 'a.java',
      ratchet: {
        key: 'pair:a.java|b.java:clone',
        value: 60,
        mustKeepUnchangedLines: [{ path: 'a.java', startLine: 3, endLine: 9 }],
      },
    };
    const withLines = (mustKeepUnchangedLines) => ({
      ...finding,
      ratchet: { ...finding.ratchet, mustKeepUnchangedLines },
    });
    const reversed = withLines([{ path: 'a.java', startLine: 9, endLine: 3 }]);
    const unnamed = withLines([{ startLine: 3, endLine: 9 }]);

    expect(parseFinding(finding)).toEqual(finding);
    expect(findingsSchemaErrors([finding])).toEqual([]);
    expect(() => parseFinding(reversed)).toThrow(TypeError);
    expect(() => parseFinding(unnamed)).toThrow(TypeError);
    expect(findingsSchemaErrors([unnamed])[0]).toContain(
      "mustKeepUnchangedLines/0 must have required property 'path'",
    );
  });

  it('accepts a tool-not-run notice on a descriptive finding', () => {
    const finding = {
      ...NOT_RUN,
      tool: 'javac',
      rule: 'lint-not-run',
      path: '.',
      identity: 'lint-not-run',
      message: 'No javac lint report.',
    };

    expect(parseFinding(finding)).toEqual(finding);
    expect(findingsSchemaErrors([finding])).toEqual([]);
  });

  it('accepts a tool-not-run notice scoped to directories and an identity prefix', () => {
    const finding = {
      ...NOT_RUN,
      tool: 'duplicates',
      rule: 'cpd-not-run',
      path: '.',
      identity: 'cpd-not-run',
      message: 'No CPD duplicate report.',
      notRunScope: ['core/src/main/java', 'core/src/test/java'],
      notRunIdentityPrefix: 'cpd:',
    };

    expect(parseFinding(finding)).toEqual(finding);
    expect(findingsSchemaErrors([finding])).toEqual([]);
    expect(parseFinding({ ...finding, notRunScope: ['./', '.\\', 'core\\src/'] })).toEqual({
      ...finding,
      notRunScope: ['.', '.', 'core/src'],
    });
  });
});
