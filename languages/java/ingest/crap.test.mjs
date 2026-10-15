import {
  expectedOutput31_33,
  expectedOutput41_49,
  expectedOutput94_31,
} from '../../../core/diff/fixtures/expected-output/languages-java-ingest-crap.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { calculateCrap, ingestCrap, parseLizardCsv } from './crap.mjs';

const fixture = (name) => readFileSync(path.resolve(import.meta.dirname, 'fixtures', name), 'utf8');
const SOURCE_ROOTS = ['src/main/java'];
const ingest = (csv = fixture('lizard.csv'), xml = fixture('jacoco-crap.xml'), options = {}) =>
  ingestCrap(csv, xml, { sourceRoots: SOURCE_ROOTS, ...options }).findings;

describe('ingestCrap', () => {
  it('computes CRAP as ccn^2 * (1 - coverage)^3 + ccn', () => {
    expect(calculateCrap(9, 100)).toBe(9);
    expect(calculateCrap(9, 0)).toBe(90);
    expect(calculateCrap(2, 50)).toBeCloseTo(2.5);
  });

  it('flags the complex uncovered method and an unmatched function, nothing else', () => {
    const findings = ingest();

    expect(findings.map((f) => `${f.rule} ${f.symbol}`)).toEqual([
      'crap-score-limit Calc::classify( int a , int b , String s)',
      'crap-coverage-unknown Calc::Inner::get( int a)',
    ]);
    expect(findings.every((f) => f.tool === 'crap' && f.classification === 'enforceable')).toBe(
      true,
    );
    expect(findings[0].path).toBe('src/main/java/demo/Calc.java');
    expect(findings[0].message).toEqual(expectedOutput31_33());
    expect(() => parseAnalyzerReport({ findings }, 'java')).not.toThrow();
  });

  it('joins constructors, anonymous-class methods and uses the lower of line and branch coverage', () => {
    // run(): ccn 2, 100% lines but 50% branches -> CRAP 2.5; the constructor matches `<init>`.
    expect(ingest().some((f) => f.symbol.includes('run') || f.symbol.includes('Calc::Calc'))).toBe(
      false,
    );
    const higher = fixture('lizard.csv').replace('3,2,22,0,3,', '3,8,22,0,3,');
    expect([...new Set(ingest(higher).map((f) => f.symbol))].sort()).toEqual(expectedOutput41_49());
  });

  it('treats CRAP exactly at the limit as a failure, like the TypeScript check', () => {
    const covered = fixture('jacoco-crap.xml').replace(
      '<counter type="LINE" missed="11" covered="1"/>\n        <counter type="BRANCH" missed="14" covered="2"/>',
      '<counter type="LINE" missed="0" covered="12"/>',
    );
    expect(ingest(undefined, covered).map((f) => f.rule)).toEqual([
      'crap-score-limit',
      'crap-coverage-unknown',
    ]);
    expect(ingest(undefined, covered, { limit: 9.01 }).map((f) => f.rule)).toEqual([
      'crap-coverage-unknown',
    ]);
  });

  it('never puts a line number in the identity, and numbers repeated identities', () => {
    const csv = fixture('lizard.csv');
    const shifted = csv.replaceAll(
      /,(\d+),(\d+)$/gm,
      (_, a, b) => `,${Number(a) + 40},${Number(b) + 40}`,
    );
    const xml = fixture('jacoco-crap.xml').replace(
      / line="(\d+)"/g,
      (_, n) => ` line="${Number(n) + 40}"`,
    );

    expect(ingest(shifted, xml).map((f) => f.identity)).toEqual(ingest().map((f) => f.identity));
    for (const finding of ingest()) {
      expect(finding.identity).not.toMatch(/\d{2,}/);
    }

    const twice = `${csv}${csv.split('\n')[1]}\n`;
    expect(new Set(ingest(twice).map((f) => f.identity)).size).toBe(ingest(twice).length);
  });

  describe('an edited method over the limit', () => {
    const scoreFinding = (findings) => findings.find((f) => f.rule === 'crap-score-limit');
    const withHash = (sourceHash, csv = fixture('lizard.csv')) =>
      ingest(csv, undefined, { sourceHash: () => sourceHash });
    const edit = (headCsv) =>
      compareFindings({
        baseFindings: withHash('before'),
        headFindings: withHash('after', headCsv),
      });

    it('keys the score finding by the method source and ratchets on the method alone', () => {
      const finding = scoreFinding(withHash('abc'));

      expect(finding.identity).toBe(
        'function:Calc::classify( int a , int b , String s):source:abc',
      );
      expect(finding.ratchet).toEqual(expectedOutput94_31());
    });

    it('stays baselined when the score is unchanged', () => {
      const result = edit(fixture('lizard.csv'));

      expect(result.newFindings).toEqual([]);
      expect(result.unchangedFindings.map((f) => f.rule)).toEqual([
        'crap-coverage-unknown',
        'crap-score-limit',
      ]);
    });

    it('stays baselined when the score fell', () => {
      const result = edit(fixture('lizard.csv').replace('13,9,109', '13,8,109'));

      expect(result.newFindings).toEqual([]);
    });

    it('fails when the score rose, and says from what', () => {
      const result = edit(fixture('lizard.csv').replace('13,9,109', '13,10,109'));

      expect(scoreFinding(result.newFindings).message).toBe(
        'Calc::classify( int a , int b , String s) CRAP rose from 71.39 to 87.03 (limit 9). Put new code in a new function and cover it with tests.',
      );
    });

    it('does not key a method with unknown coverage by its source', () => {
      const unknown = withHash('abc').find((f) => f.rule === 'crap-coverage-unknown');

      expect(unknown.identity).toBe('function:Calc::Inner::get( int a)');
    });
  });

  it('rejects malformed input', () => {
    expect(() => parseLizardCsv('a,b,c')).toThrow('Unrecognized lizard CSV row');
    expect(() => ingestCrap('', '<x/>')).toThrow('<report>');
    expect(ingest('')).toEqual([]);
  });
});
