import { describe, expect, it } from 'vitest';
import { OVERLAP_PAIRS, matchesRule, withoutOverlaps } from './static-overlaps.mjs';

const TOOLS =
  /^(?:(?:pmd|spotbugs|errorprone)\/|checkstyle\/com\.puppycrawl\.tools\.checkstyle\.checks\.)/u;
const SOURCE = [
  'package demo;',
  'public class A {',
  '  private int f;',
  '  void m() {',
  '    f = 1;',
  '    f = 2;',
  '  }',
  '  void n() {',
  '    f = 3;',
  '  }',
  '}',
  'class B {',
  '  private int f;',
  '}',
].join('\n');

function at(printedRule, line, extra = {}) {
  const [tool, ...rule] = printedRule.replace('*', 'X').split('/');
  return {
    tool,
    rule: rule.join('/'),
    path: 'src/A.java',
    ...(line === undefined ? {} : { location: { line } }),
    ...extra,
  };
}

const SCOPED = {
  line: { primary: 5, covered: { line: 5 }, apart: { line: 6 } },
  member: { primary: 5, covered: { line: 6 }, apart: { line: 9 } },
  class: { primary: 5, covered: { line: 9 }, apart: { line: 13 } },
  file: { primary: 5, covered: { line: 13 }, apart: { line: 5, path: 'src/Other.java' } },
  field: { primary: 3, covered: { symbol: 'demo.A.f' }, apart: { symbol: 'demo.B.f' } },
};

function secondaryAt(rule, { line, ...extra }) {
  return at(rule, line, extra);
}

const readSource = (file) => (file === 'src/A.java' ? SOURCE : undefined);
const cases = OVERLAP_PAIRS.flatMap(({ primary, secondary, scope }) =>
  secondary.map((rule) => [rule, primary[0], scope]),
);

describe('overlap pairs', () => {
  it('name printed rules of the four tools, in known scopes, with no rule depending on itself', () => {
    const rules = OVERLAP_PAIRS.flatMap(({ primary, secondary }) => [...primary, ...secondary]);
    const coveredBy = (rule) =>
      OVERLAP_PAIRS.filter(({ secondary }) => matchesRule(secondary, rule)).flatMap(
        ({ primary }) => primary,
      );
    function reaches(from, target) {
      const pending = coveredBy(from);
      const seen = new Set();
      for (const next of pending) {
        if (next === target) {
          return true;
        }
        if (!seen.has(next)) {
          seen.add(next);
          pending.push(...coveredBy(next));
        }
      }
      return false;
    }

    expect(rules.filter((rule) => !TOOLS.test(rule))).toStrictEqual([]);
    expect(OVERLAP_PAIRS.filter(({ scope }) => !(scope in SCOPED))).toStrictEqual([]);
    expect(rules.filter((rule) => reaches(rule, rule))).toStrictEqual([]);
  });

  it.each(cases)(
    'drops %s where %s is reported, in the same %s only',
    (secondary, primary, scope) => {
      const { primary: line, covered, apart } = SCOPED[scope];
      const reported = at(primary, line);
      const kept = secondaryAt(secondary, apart);

      expect(
        withoutOverlaps([reported, secondaryAt(secondary, covered), kept], { readSource }),
      ).toStrictEqual([reported, kept]);
    },
  );

  it('keeps a secondary whose only primary is itself dropped', () => {
    const findings = [
      at('errorprone/ReturnFromVoid', 5),
      at('checkstyle/com.puppycrawl.tools.checkstyle.checks.javadoc.JavadocMethodCheck', 5),
      at('errorprone/InvalidParam', 5),
    ];

    expect(withoutOverlaps(findings, { readSource })).toStrictEqual([findings[0], findings[2]]);
  });
});
