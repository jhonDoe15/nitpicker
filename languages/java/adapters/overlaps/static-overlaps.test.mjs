import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG_TOOLS, readCatalog } from '../../messages/rule-messages.mjs';
import { OVERLAP_PAIRS, matchesRule, withoutOverlaps } from './static-overlaps.mjs';

const CHECKS = path.resolve(import.meta.dirname, '../../gradle/errorprone/checks.json');
const KNOWN_RULES = [
  'errorprone/NullAway',
  ...JSON.parse(readFileSync(CHECKS, 'utf8')).suppressible.map((check) => `errorprone/${check}`),
  ...CATALOG_TOOLS.flatMap((tool) =>
    Object.keys(readCatalog(tool)).map((rule) => `${tool}/${rule}`),
  ),
];
const TOOLS = /^(?:pmd|spotbugs|errorprone|checkstyle)\/[A-Za-z0-9_*]+$/u;
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
  '/**',
  ' * @author x',
  ' */',
  'class C {}',
  '/** D. */',
  'class D {}',
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
  javadoc: { primary: 16, covered: { line: 15 }, apart: { line: 19 } },
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

  it('name rules as the findings print them: Checkstyle module ids, catalog rules, Error Prone checks', () => {
    const rules = OVERLAP_PAIRS.flatMap(({ primary, secondary }) => [...primary, ...secondary]);

    expect(
      rules.filter((rule) => !KNOWN_RULES.some((known) => matchesRule([rule], known))),
    ).toStrictEqual([]);
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
      at('checkstyle/JavadocMethod', 5),
      at('errorprone/InvalidParam', 5),
    ];

    expect(withoutOverlaps(findings, { readSource })).toStrictEqual([findings[0], findings[2]]);
  });
});
