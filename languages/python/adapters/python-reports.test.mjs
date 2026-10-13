import { describe, expect, it } from 'vitest';
import { ruffFindings } from './python-reports.mjs';

const root = '/work/project';
const sarif = (...results) => ({
  runs: [
    {
      tool: { driver: { name: 'ruff' } },
      results: results.map(({ rule, text, line }) => ({
        ruleId: rule,
        level: 'error',
        message: { text },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: `file://${root}/src/a.py` },
              region: { startLine: line, startColumn: 1 },
            },
          },
        ],
      })),
    },
  ],
});
const identities = (log) =>
  ruffFindings(log, { roots: [root], projectRoot: root }).map(({ identity }) => identity);

describe('ruff findings', () => {
  it('keep the identity of a redefinition when the code above it moves', () => {
    const before = sarif({
      rule: 'F811',
      text: 'Redefinition of unused `dup` from line 5',
      line: 9,
    });
    const after = sarif({
      rule: 'F811',
      text: 'Redefinition of unused `dup` from line 10',
      line: 14,
    });

    expect(identities(after)).toEqual(['fp:nitpicker/subject=Redefinition of unused `dup`']);
    expect(identities(after)).toEqual(identities(before));
  });

  it('keep the line in the message', () => {
    const [finding] = ruffFindings(
      sarif({ rule: 'F811', text: 'Redefinition of unused `dup` from line 10', line: 14 }),
      { roots: [root], projectRoot: root },
    );

    expect(finding.message).toBe('Redefinition of unused `dup` from line 10');
  });
});
