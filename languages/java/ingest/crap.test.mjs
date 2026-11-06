import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { calculateCrap, parseLizardCsv } from '../../../shared/ingest/lizard-crap.mjs';
import { hash } from '../../../shared/rules/finding-helpers.mjs';
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
      'Calc.classify has CRAP 71.39; score must be below 9. Test its uncovered branches, or split a branchy part into its own function. If this is intended, add {"rule":"crap-score-limit","paths":["src/main/java/demo/Calc.java"],"function":"Calc.classify","reason":"..."} to "exceptions" in nitpicker.config.json.',
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
    expect(ingest()).not.toHaveLength(0);
    expect(ingest().filter((finding) => /\d{2,}/.test(finding.identity))).toEqual([]);

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
      'Calc.Inner.get has unknown coverage and no CRAP score: JaCoCo has no data for it, so no test runs it or it is annotated @Generated. Add a test that calls it, and remove @Generated from hand-written code. If this is intended, add {"rule":"crap-coverage-unknown","paths":["src/main/java/demo/Calc.java"],"function":"Calc.Inner.get","reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('asks a fully covered method over the limit to reduce its branches', () => {
    const covered = fixture('jacoco-crap.xml').replace(
      '<counter type="LINE" missed="11" covered="1"/>\n        <counter type="BRANCH" missed="14" covered="2"/>',
      '<counter type="LINE" missed="0" covered="12"/>',
    );
    const score = ingest(undefined, covered).find((f) => f.rule === 'crap-score-limit');

    expect(score.message).toBe(
      'Calc.classify has CRAP 9.00 although tests cover it; score must be below 9. Reduce its branches: split a branchy part into its own function. If this is intended, add {"rule":"crap-score-limit","paths":["src/main/java/demo/Calc.java"],"function":"Calc.classify","reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  describe('an edited method over the limit', () => {
    const scoreFinding = (findings) => findings.find((f) => f.rule === 'crap-score-limit');
    const withHash = (sourceText, entries = structure()) =>
      ingest(entries, undefined, { sourceText: () => sourceText });
    const edit = (headEntries) =>
      compareFindings({
        baseFindings: withHash('before'),
        headFindings: withHash('after', headEntries),
      });

    it('keys the score finding by the method source and ratchets on the method alone', () => {
      const finding = scoreFinding(withHash('abc'));

      expect(finding.identity).toBe(
        `function:Calc.classify(int, int, String):source:${hash('abc')}`,
      );
      expect(finding.ratchet).toEqual({
        key: 'function:Calc.classify(int, int, String):crap',
        declarationKey: `function:Calc.classify(int, int, String):declaration:${hash('Calc.classify(int, int, String)')}:crap`,
        value: expect.any(Number),
        worseMessage:
          'Calc.classify CRAP rose from {base} to 71.39 (limit 9). Put new code in a new function and cover it with tests. If this is intended, add {"rule":"crap-score-limit","paths":["src/main/java/demo/Calc.java"],"function":"Calc.classify","reason":"..."} to "exceptions" in nitpicker.config.json.',
        worseAllowedForm: 'Put new code in a new function and cover it with tests.',
        heldMessage:
          'Calc.classify: CRAP 71.39 (limit 9), allowed because base was {base}; any increase fails.',
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
        'Calc.classify CRAP rose from 71.39 to 87.03 (limit 9). Put new code in a new function and cover it with tests. If this is intended, add {"rule":"crap-score-limit","paths":["src/main/java/demo/Calc.java"],"function":"Calc.classify","reason":"..."} to "exceptions" in nitpicker.config.json.',
      );
    });

    it('does not key a method with unknown coverage by its source', () => {
      const unknown = withHash('abc').find((f) => f.rule === 'crap-coverage-unknown');

      expect(unknown.identity).toBe('function:Calc.Inner.get(int)');
    });
  });

  describe('lambdas and initializer blocks', () => {
    const FILE = 'src/main/java/demo/Box.java';
    const unit = (name, [start, end], complexity, flags = {}) => ({
      file: FILE,
      name: `Box.${name}`,
      start,
      end,
      complexity,
      signature: `Box.${name}`,
      ...flags,
    });
    const jacocoMethod = (name, line, covered, missed) =>
      `<method name="${name}" desc="()V" line="${line}"><counter type="LINE" missed="${missed}" covered="${covered}"/></method>`;
    const sourceLine = (number, covered, missed) =>
      `<line nr="${number}" mi="${missed}" ci="${covered}" mb="0" cb="0"/>`;
    const report = ({ methods, lines }) =>
      `<report name="demo"><package name="demo"><class name="demo/Box" sourcefilename="Box.java">${methods.join('')}</class><sourcefile name="Box.java">${lines.join('')}</sourcefile></package></report>`;
    const scores = (entries, xml) =>
      ingest(entries, xml, { limit: 1 }).map(
        ({ symbol, identity, message }) =>
          `${symbol} ${identity} ${/CRAP (\d+\.\d+)/.exec(message)?.[1] ?? 'unknown'}`,
      );

    it('scores a lambda by its synthetic lambda$ method and leaves the lambda inside it out', () => {
      const entries = [
        unit('run', [10, 30], 2),
        unit('run.<lambda>', [12, 20], 4, { lambda: true }),
        unit('run.<lambda>.<lambda>', [15, 15], 3, { lambda: true }),
      ];
      const xml = report({
        methods: [
          jacocoMethod('run', 10, 6, 0),
          jacocoMethod('lambda$run$1', 15, 0, 1),
          jacocoMethod('lambda$run$0', 12, 5, 0),
        ],
        lines: [],
      });

      expect(scores(entries, xml)).toEqual([
        'Box.run function:Box.run 2.00',
        'Box.run.<lambda> function:Box.run.<lambda> 4.00',
        'Box.run.<lambda>.<lambda> function:Box.run.<lambda>.<lambda> 12.00',
      ]);
    });

    it('never matches a lambda to a named method that starts in its range', () => {
      const entries = [unit('run.<lambda>', [12, 20], 4, { lambda: true })];
      const xml = report({ methods: [jacocoMethod('helper', 13, 3, 0)], lines: [] });

      expect(scores(entries, xml)).toEqual(['Box.run.<lambda> function:Box.run.<lambda> unknown']);
    });

    it('scores an initializer block by the coverage of its own lines, whatever method holds them', () => {
      const entries = [
        unit('<clinit>', [40, 46], 3, { initializer: true }),
        unit('<clinit>.<lambda>', [43, 43], 1, { lambda: true }),
      ];
      const xml = report({
        methods: [
          jacocoMethod('lambda$static$0', 43, 0, 1),
          jacocoMethod('&lt;clinit&gt;', 3, 2, 3),
        ],
        lines: [
          sourceLine(41, 1, 0),
          sourceLine(42, 0, 1),
          sourceLine(43, 0, 1),
          sourceLine(44, 1, 0),
          sourceLine(50, 0, 3),
        ],
      });

      expect(scores(entries, xml)).toEqual([
        'Box.<clinit> function:Box.<clinit> 3.33',
        'Box.<clinit>.<lambda> function:Box.<clinit>.<lambda> 2.00',
      ]);
    });

    it('numbers repeated blocks and lambdas only among the ones over the limit with the same source', () => {
      const entries = [
        unit('<init>', [10, 12], 3, { initializer: true }),
        unit('<init>', [20, 22], 3, { initializer: true }),
        unit('run.<lambda>', [30, 31], 3, { lambda: true }),
        unit('run.<lambda>', [40, 41], 3, { lambda: true }),
      ];
      const xml = report({
        methods: [jacocoMethod('lambda$run$0', 30, 2, 0), jacocoMethod('lambda$run$1', 40, 0, 2)],
        lines: [sourceLine(11, 0, 1), sourceLine(21, 0, 1)],
      });
      const findings = ingest(entries, xml, {
        limit: 4,
        sourceText: ({ start }) => String(start % 20),
      });

      expect(findings.map(({ symbol, identity }) => `${symbol} ${identity}`)).toEqual([
        `Box.<init> function:Box.<init>:source:${hash('10')}`,
        `Box.<init> function:Box.<init>:source:${hash('0')}`,
        `Box.run.<lambda> function:Box.run.<lambda>:source:${hash('0')}`,
      ]);
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
