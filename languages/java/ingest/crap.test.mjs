import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { calculateCrap, parseLizardCsv } from '../../../shared/ingest/lizard-crap.mjs';
import { ingestCrap } from './crap.mjs';

const fixture = (name) => readFileSync(path.resolve(import.meta.dirname, 'fixtures', name), 'utf8');
const SOURCE_ROOTS = ['src/main/java'];
const structure = () => JSON.parse(fixture('structure.json'));
const withComplexity = (name, complexity) =>
  structure().map((entry) => (entry.name === name ? { ...entry, complexity } : entry));
const ingest = (entries = structure(), xml = fixture('jacoco-crap.xml'), options = {}) =>
  ingestCrap(entries, xml, { sourceRoots: SOURCE_ROOTS, ...options }).findings;

describe('ingestCrap', () => {
  it('computes CRAP as ccn^2 * (1 - coverage)^3 + ccn', () => {
    expect(calculateCrap(9, 100)).toBe(9);
    expect(calculateCrap(9, 0)).toBe(90);
    expect(calculateCrap(2, 50)).toBeCloseTo(2.5);
  });

  it('flags the complex uncovered method and an unmatched function, nothing else', () => {
    const findings = ingest();

    expect(findings.map((f) => `${f.rule} ${f.symbol}`)).toEqual([
      'crap-score-limit Calc.classify(int, int, String)',
      'crap-coverage-unknown Calc.Inner.get(int)',
    ]);
    expect(findings.every((f) => f.tool === 'crap' && f.classification === 'enforceable')).toBe(
      true,
    );
    expect(findings[0].path).toBe('src/main/java/demo/Calc.java');
    expect(findings[0].message).toEqual(
      'Calc.classify(int, int, String) has CRAP 71.39; score must be below 9. Test its uncovered branches, or split a branchy part into its own function.',
    );
    expect(() => parseAnalyzerReport({ findings }, 'java')).not.toThrow();
  });

  it('joins constructors, anonymous-class methods and uses the lower of line and branch coverage', () => {
    const higher = withComplexity('Calc.<anonymous>.run', 8);
    expect([...new Set(ingest(higher).map((f) => f.symbol))].sort()).toEqual([
      'Calc.<anonymous>.run()',
      'Calc.Inner.get(int)',
      'Calc.classify(int, int, String)',
    ]);
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
    const entries = structure();
    const shifted = entries.map((e) => ({ ...e, start: e.start + 40, end: e.end + 40 }));
    const xml = fixture('jacoco-crap.xml').replace(
      / line="(\d+)"/g,
      (_, n) => ` line="${Number(n) + 40}"`,
    );

    expect(ingest(shifted, xml).map((f) => f.identity)).toEqual(ingest().map((f) => f.identity));
    for (const finding of ingest()) {
      expect(finding.identity).not.toMatch(/\d{2,}/);
    }

    const twice = [...entries, entries[1]];
    expect(new Set(ingest(twice).map((f) => f.identity)).size).toBe(ingest(twice).length);
  });

  it('numbers repeated signatures per file, so another file never shifts an identity', () => {
    const [entry] = structure();
    const repeated = (file) => ({ ...entry, file, signature: 'X.run()' });
    const entries = [
      repeated('src/main/java/demo/A.java'),
      repeated('src/main/java/demo/A.java'),
      repeated('src/main/java/demo/B.java'),
    ];

    expect(ingest(entries).map((f) => `${f.path} ${f.identity}`)).toEqual([
      'src/main/java/demo/A.java function:X.run()',
      'src/main/java/demo/A.java function:X.run()#2',
      'src/main/java/demo/B.java function:X.run()',
    ]);
  });

  it('joins the constructor of a local class, whose JaCoCo class is Outer$1Loc', () => {
    const xml = [
      '<report name="demo"><package name="demo">',
      '<class name="demo/Outer$1Loc" sourcefilename="Outer.java">',
      '<method name="&lt;init&gt;" desc="()V" line="5">',
      '<counter type="LINE" missed="7" covered="0"/>',
      '</method></class></package></report>',
    ].join('');
    const local = {
      file: 'src/main/java/demo/Outer.java',
      name: 'Outer.Loc.Loc',
      start: 5,
      end: 7,
      complexity: 12,
      signature: 'Outer.Loc.Loc()',
    };

    expect(ingest([local], xml).map((f) => `${f.rule} ${f.symbol}`)).toEqual([
      'crap-score-limit Outer.Loc.Loc()',
    ]);
  });

  describe('a constructor whose JaCoCo method starts at a field initializer', () => {
    const jacocoConstructor = (descriptor, line) =>
      [
        '<report name="demo"><package name="demo">',
        '<class name="demo/Service" sourcefilename="Service.java">',
        `<method name="&lt;init&gt;" desc="${descriptor}" line="${line}">`,
        '<counter type="LINE" missed="0" covered="4"/>',
        '</method></class></package></report>',
      ].join('');
    const constructor = (parameterTypes) => ({
      file: 'src/main/java/demo/Service.java',
      name: 'Service.Service',
      start: 15,
      end: 20,
      complexity: 12,
      signature: `Service.Service(${parameterTypes.join(', ')})`,
      parameterTypes,
    });

    it('is joined by its parameter types, not by the line of the initializer', () => {
      const findings = ingest(
        [constructor(['Clock'])],
        jacocoConstructor('(Ljava/time/Clock;)V', 12),
      );

      expect(findings.map((f) => `${f.rule} ${f.symbol}`)).toEqual([
        'crap-score-limit Service.Service(Clock)',
      ]);
    });

    it('joins generic, array, primitive and erased type-variable parameters', () => {
      const declared = ['List', 'int[]', 'Object', 'Entry'];
      const descriptor = '(Ljava/util/List;[ILjava/lang/Object;Ljava/util/Map$Entry;)V';

      expect(
        ingest([constructor(declared)], jacocoConstructor(descriptor, 3)).map((f) => f.rule),
      ).toEqual(['crap-score-limit']);
    });

    it('joins an enum or inner constructor, whose descriptor has leading synthetic parameters', () => {
      const descriptor = '(Ljava/lang/String;ILjava/lang/String;)V';

      expect(
        ingest([constructor(['String'])], jacocoConstructor(descriptor, 3)).map((f) => f.rule),
      ).toEqual(['crap-score-limit']);
    });

    it('does not join another constructor of the class', () => {
      const findings = ingest(
        [constructor(['Clock'])],
        jacocoConstructor('(Ljava/lang/String;)V', 12),
      );

      expect(findings.map((f) => f.rule)).toEqual(['crap-coverage-unknown']);
    });

    it('does not join a constructor with a different number of parameters', () => {
      const findings = ingest([constructor(['Clock'])], jacocoConstructor('()V', 12));

      expect(findings.map((f) => f.rule)).toEqual(['crap-coverage-unknown']);
    });

    it('does not join a primitive to an erased type variable', () => {
      const findings = ingest([constructor(['Object'])], jacocoConstructor('(I)V', 12));

      expect(findings.map((f) => f.rule)).toEqual(['crap-coverage-unknown']);
    });
  });

  it('says in the Java text that JaCoCo has no data, and names @Generated', () => {
    const unknown = ingest().find((f) => f.rule === 'crap-coverage-unknown');

    expect(unknown.message).toBe(
      'Calc.Inner.get(int) has unknown coverage and no CRAP score: JaCoCo has no data for it, so no test runs it or it is annotated @Generated. Add a test that calls it, and remove @Generated from hand-written code.',
    );
  });

  it('asks a fully covered method over the limit to reduce its branches', () => {
    const covered = fixture('jacoco-crap.xml').replace(
      '<counter type="LINE" missed="11" covered="1"/>\n        <counter type="BRANCH" missed="14" covered="2"/>',
      '<counter type="LINE" missed="0" covered="12"/>',
    );
    const score = ingest(undefined, covered).find((f) => f.rule === 'crap-score-limit');

    expect(score.message).toBe(
      'Calc.classify(int, int, String) has CRAP 9.00 although tests cover it; score must be below 9. Reduce its branches: split a branchy part into its own function.',
    );
  });

  describe('an edited method over the limit', () => {
    const scoreFinding = (findings) => findings.find((f) => f.rule === 'crap-score-limit');
    const withHash = (sourceHash, entries = structure()) =>
      ingest(entries, undefined, { sourceHash: () => sourceHash });
    const edit = (headEntries) =>
      compareFindings({
        baseFindings: withHash('before'),
        headFindings: withHash('after', headEntries),
      });

    it('keys the score finding by the method source and ratchets on the method alone', () => {
      const finding = scoreFinding(withHash('abc'));

      expect(finding.identity).toBe('function:Calc.classify(int, int, String):source:abc');
      expect(finding.ratchet).toEqual({
        key: 'function:Calc.classify(int, int, String):crap',
        value: expect.any(Number),
        worseMessage:
          'Calc.classify(int, int, String) CRAP rose from {base} to 71.39 (limit 9). Put new code in a new function and cover it with tests.',
        heldMessage:
          'Calc.classify(int, int, String): CRAP 71.39 (limit 9), allowed because base was {base}; any increase fails.',
      });
    });

    it('stays baselined when the score is unchanged', () => {
      const result = edit(structure());

      expect(result.newFindings).toEqual([]);
      expect(result.unchangedFindings.map((f) => f.rule)).toEqual([
        'crap-coverage-unknown',
        'crap-score-limit',
      ]);
    });

    it('stays baselined when the score fell', () => {
      const result = edit(withComplexity('Calc.classify', 8));

      expect(result.newFindings).toEqual([]);
    });

    it('fails when the score rose, and says from what', () => {
      const result = edit(withComplexity('Calc.classify', 10));

      expect(scoreFinding(result.newFindings).message).toBe(
        'Calc.classify(int, int, String) CRAP rose from 71.39 to 87.03 (limit 9). Put new code in a new function and cover it with tests.',
      );
    });

    it('does not key a method with unknown coverage by its source', () => {
      const unknown = withHash('abc').find((f) => f.rule === 'crap-coverage-unknown');

      expect(unknown.identity).toBe('function:Calc.Inner.get(int)');
    });
  });

  it('leaves out a private empty constructor, which JaCoCo omits from its report', () => {
    const [util] = structure().filter((e) => e.name === 'Calc.Util.Util');
    const reported = ingest([{ ...util, privateEmptyConstructor: false }]);

    expect(reported.map((f) => `${f.rule} ${f.symbol}`)).toEqual([
      'crap-coverage-unknown Calc.Util.Util()',
    ]);
    expect(ingest([util])).toEqual([]);
  });

  it('rejects malformed input', () => {
    expect(() => ingest([{ name: 'A.a', file: 'a' }])).toThrow(
      new TypeError('Structure entry without complexity: A.a'),
    );
    expect(() => ingest([{ name: 'A.a', file: 'a', complexity: 2 }])).toThrow(
      new TypeError('Structure entry without signature: A.a'),
    );
    expect(() => parseLizardCsv('a,b,c')).toThrow(
      new TypeError('Unrecognized lizard CSV row: a,b,c'),
    );
    expect(() => ingestCrap([], '<x/>')).toThrow('<report>');
    expect(ingest([])).toEqual([]);
  });
});
