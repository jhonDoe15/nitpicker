import { describe, expect, it } from 'vitest';
import { readKnipReport } from './knip-run.mts';

describe('readKnipReport', () => {
  it('parses a clean JSON report', () => {
    expect(readKnipReport('{"files":["src/unused.ts"],"issues":[]}\n')).toEqual({
      files: ['src/unused.ts'],
      issues: [],
    });
  });

  it('ignores leading stdout lines printed by a loaded config file', () => {
    const output = [
      '[dotenv@17.2.2] injecting env (0) from .env',
      '{"files":[],"issues":[{"file":"src/a.ts","exports":[]}]}',
      '',
    ].join('\n');

    expect(readKnipReport(output)).toEqual({
      files: [],
      issues: [{ file: 'src/a.ts', exports: [] }],
    });
  });

  it('handles multi-line leading logs including braces before a pretty-printed report', () => {
    const output = [
      'loading config { mode: test }',
      '{not json}',
      '{',
      '  "files": ["src/dead.ts"],',
      '  "issues": []',
      '}',
    ].join('\n');

    expect(readKnipReport(output)).toEqual({
      files: ['src/dead.ts'],
      issues: [],
    });
  });

  it('rejects non-object JSON and output with no JSON report', () => {
    expect(() => readKnipReport('[]')).toThrow('knip did not print a JSON object');
    expect(() => readKnipReport('[dotenv@17.2.2] injecting env (0) from .env\n')).toThrow(
      SyntaxError,
    );
  });
});
