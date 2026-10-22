import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applyFindingPolicy } from '../../../../shared/findings/finding-policy.mjs';
import { OVERLAP_PAIRS, withoutOverlaps } from './static-overlaps.mjs';

const DOCS = path.resolve(import.meta.dirname, '../../../../docs/java-preset.md');
const PROBE = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures/probe-findings.json'), 'utf8'),
);
const PARTIAL = new Set([
  'DM_DEFAULT_ENCODING',
  'EI_EXPOSE_REP',
  'HE_EQUALS_USE_HASHCODE',
  'OverrideBothEqualsAndHashcode',
  'RE_POSSIBLE_UNINTENDED_PATTERN',
  'ReturnEmptyCollectionRatherThanNull',
  'RV_RETURN_VALUE_IGNORED',
  'SS_SHOULD_BE_STATIC',
  'URF_UNREAD_FIELD',
  'UUF_UNUSED_FIELD',
]);
const roots = [];

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function resolvedProbe() {
  const findings = PROBE.findings.map(({ line, ...finding }) => ({
    ...finding,
    ...(line === undefined ? {} : { location: { line } }),
  }));
  return withoutOverlaps(findings, { readSource: (file) => PROBE.sources[file] });
}

function name(finding) {
  return `${path.basename(finding.path)}:${String(finding.location?.line ?? finding.symbol)}`;
}

function sharedLines(findings) {
  const lines = Map.groupBy(
    findings.filter((finding) => finding.location !== undefined),
    (finding) => name(finding),
  );
  return [...lines]
    .filter(([, group]) => new Set(group.map(({ tool }) => tool)).size > 1)
    .map(([line, group]) => [
      line,
      [...new Set(group.map(({ tool, rule }) => `${tool}/${rule}`))].sort(),
    ])
    .sort(([left], [right]) => left.localeCompare(right));
}

const reported = (tool, rule) => ({
  tool,
  rule,
  path: 'src/A.java',
  identity: `${tool}-${rule}`,
  classification: 'enforceable',
  location: { line: 5 },
});

describe('overlaps on the probe project', () => {
  it('leave two tools on one line only where they report different issues', () => {
    expect(sharedLines(resolvedProbe())).toStrictEqual([
      ['C1Arrays.java:8', ['errorprone/JavaUtilDate', 'pmd/AvoidFieldNameMatchingMethodName']],
      [
        'C4Switches.java:6',
        ['errorprone/StatementSwitchToExpressionSwitch', 'pmd/NonExhaustiveSwitch'],
      ],
      ['C8Equals.java:4', ['checkstyle/MemberName', 'errorprone/FieldCanBeStatic']],
      ['EqOnly.java:4', ['checkstyle/MemberName', 'errorprone/FieldCanBeStatic']],
      [
        'Fields.java:5',
        [
          'checkstyle/MemberName',
          'errorprone/FieldCanBeStatic',
          'pmd/AvoidFieldNameMatchingMethodName',
        ],
      ],
      [
        'Hiding.java:12',
        ['errorprone/HidingField', 'spotbugs/URF_UNREAD_PUBLIC_OR_PROTECTED_FIELD'],
      ],
      ['Hiding.java:5', ['errorprone/NullAway', 'pmd/AvoidFieldNameMatchingMethodName']],
      ['Numbers.java:9', ['errorprone/RandomModInteger', 'spotbugs/DMI_RANDOM_USED_ONLY_ONCE']],
      ['Obsolete.java:10', ['errorprone/JdkObsolete', 'pmd/LooseCoupling']],
      ['Obsolete.java:11', ['errorprone/JdkObsolete', 'pmd/LooseCoupling']],
      ['Obsolete.java:12', ['errorprone/JdkObsolete', 'pmd/LooseCoupling']],
      ['Obsolete.java:13', ['errorprone/JdkObsolete', 'pmd/LooseCoupling']],
      ['OldTest.java:14', ['errorprone/RedundantNullCheck', 'pmd/SimplifiableTestAssertion']],
      [
        'P2Strings.java:21',
        [
          'errorprone/ClassNewInstance',
          'spotbugs/REFLC_REFLECTION_MAY_INCREASE_ACCESSIBILITY_OF_CLASS',
        ],
      ],
      ['SelfAssign.java:7', ['errorprone/SelfAssignment', 'pmd/AvoidReassigningParameters']],
      [
        'StaticCtor.java:4',
        ['errorprone/NonFinalStaticField', 'pmd/AvoidFieldNameMatchingMethodName'],
      ],
      ['Volatile.java:4', ['checkstyle/MemberName', 'pmd/UnusedPrivateField']],
    ]);
  });

  it('keep the cases only the secondary side covers', () => {
    expect(
      resolvedProbe()
        .filter(({ rule }) => PARTIAL.has(rule))
        .map((finding) => `${name(finding)} ${finding.rule}`)
        .sort(),
    ).toStrictEqual([
      'C1Arrays.java:21 EI_EXPOSE_REP',
      'C2Strings.java:37 RE_POSSIBLE_UNINTENDED_PATTERN',
      'C3Locks.java:21 RV_RETURN_VALUE_IGNORED',
      'C3Locks.java:22 RV_RETURN_VALUE_IGNORED',
      'C6Encoding.java:11 SS_SHOULD_BE_STATIC',
      'C6Encoding.java:16 DM_DEFAULT_ENCODING',
      'HashOnly.java:5 OverrideBothEqualsAndHashcode',
      'NullColl.java:18 ReturnEmptyCollectionRatherThanNull',
      'P2Eq.java:7 HE_EQUALS_USE_HASHCODE',
      'P3Fields.java:11 URF_UNREAD_FIELD',
      'P3Fields.java:probe.P3Fields.unusedPackage UUF_UNUSED_FIELD',
    ]);
  });
});

describe('overlaps after policy', () => {
  const primary = reported('errorprone', 'DefaultCharset');
  const secondary = reported('spotbugs', 'DM_DEFAULT_ENCODING');
  const resolve = (findings) => withoutOverlaps(findings);

  it('report the secondary when the primary is excepted or not run', () => {
    const exceptions = [{ rule: 'errorprone/DefaultCharset', glob: 'src/A.java' }];

    expect(applyFindingPolicy([primary, secondary], {}, resolve)).toStrictEqual([primary]);
    expect(applyFindingPolicy([primary, secondary], { exceptions }, resolve)).toStrictEqual([
      secondary,
    ]);
    expect(applyFindingPolicy([secondary], {}, resolve)).toStrictEqual([secondary]);
  });

  it('keep the secondary dropped when the primary is baselined', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-overlaps-'));
    roots.push(root);
    const site = { file: 'src/A.java', rule: 'DefaultCharset', source: primary.identity, count: 1 };
    writeFileSync(path.join(root, 'nitpicker.legacy.json'), JSON.stringify({ sites: [site] }));
    const policy = {
      legacyInventory: 'nitpicker.legacy.json',
      policyRoot: root,
      snapshot: 'base',
      inventoryTool: 'java',
    };

    expect(applyFindingPolicy([primary, secondary], policy, resolve)).toStrictEqual([]);
  });
});

describe('the overlap list in docs/java-preset.md', () => {
  it('is the pair table, in order', () => {
    const printed = (rules) => rules.map((rule) => `\`${rule}\``).join(', ');
    const documented = readFileSync(DOCS, 'utf8')
      .split('\n')
      .filter((line) => /^- (?:line|member|javadoc|class|field|file): `/u.test(line));

    expect(documented).toStrictEqual(
      OVERLAP_PAIRS.map(
        ({ primary, secondary, scope }) =>
          `- ${scope}: ${printed(primary)} over ${printed(secondary)}`,
      ),
    );
  });
});
