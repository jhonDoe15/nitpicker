import { describe, expect, it } from 'vitest';
import { withoutOverlaps } from './static-overlaps.mjs';

const NEED_BRACES = 'com.puppycrawl.tools.checkstyle.checks.blocks.NeedBracesCheck';
const at = (tool, rule, line, extra = {}) => ({
  tool,
  rule,
  path: 'src/main/java/demo/A.java',
  location: { line },
  message: `${rule} message`,
  ...extra,
});
const kept = (findings) =>
  withoutOverlaps(findings).map(({ tool, rule, location }) => `${tool}/${rule}:${location.line}`);

describe('overlaps between the static tools', () => {
  it.each([
    ['errorprone', 'IntLongMath', 'errorprone', 'NarrowCalculation'],
    ['errorprone', 'UnnecessarySemicolon', 'checkstyle', NEED_BRACES],
    ['errorprone', 'DoubleCheckedLocking', 'spotbugs', 'IS2_INCONSISTENT_SYNC'],
    ['errorprone', 'NonFinalStaticField', 'errorprone', 'FieldCanBeFinal'],
  ])(
    'keeps %s/%s alone on a line both flag, and both on lines only one flags',
    (tool, rule, otherTool, other) => {
      expect(
        kept([
          at(otherTool, other, 3),
          at(tool, rule, 3),
          at(otherTool, other, 5),
          at(tool, rule, 7),
        ]),
      ).toStrictEqual([`${tool}/${rule}:3`, `${otherTool}/${other}:5`, `${tool}/${rule}:7`]);
    },
  );

  it('keeps the secondary side in another file on the same line', () => {
    const elsewhere = {
      ...at('errorprone', 'NarrowCalculation', 3),
      path: 'src/main/java/demo/B.java',
    };
    expect(withoutOverlaps([at('errorprone', 'IntLongMath', 3), elsewhere])).toHaveLength(2);
  });

  it('drops SpotBugs unused and unread findings for a private field PMD already names, keeping the rest', () => {
    const pmd = (field, line) =>
      at('pmd', 'UnusedPrivateField', line, {
        message: `Avoid unused private fields such as '${field}'.`,
      });
    const spotbugs = (rule, field, line) => ({
      ...at('spotbugs', rule, line, { symbol: `demo.A.${field}` }),
    });
    expect(
      kept([
        pmd('unused', 4),
        pmd('written', 6),
        spotbugs('UUF_UNUSED_FIELD', 'unused', undefined),
        spotbugs('URF_UNREAD_FIELD', 'written', 10),
        spotbugs('UUF_UNUSED_FIELD', 'packageUnused', undefined),
        spotbugs('URF_UNREAD_FIELD', 'packageWritten', 11),
      ]),
    ).toStrictEqual([
      'pmd/UnusedPrivateField:4',
      'pmd/UnusedPrivateField:6',
      'spotbugs/UUF_UNUSED_FIELD:undefined',
      'spotbugs/URF_UNREAD_FIELD:11',
    ]);
  });
});
