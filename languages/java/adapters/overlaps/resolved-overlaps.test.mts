import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applyFindingPolicy } from '../../../../shared/findings/finding-policy.mjs';
import {
  fieldOf,
  fieldsOf,
  listOf,
  optionalText,
  parseJson,
  textOf,
} from '../../../../shared/values/readers.mts';
import { callUntyped, findingsOf, type JavaFinding } from '../typed/java-values.mts';
import {
  matchesRule,
  overlapPairs,
  withoutOverlaps,
  type OverlapPair,
} from './static-overlaps.mts';
import { guidePages, guideText } from '../../../../shared/reference/build/guide-pages.mjs';

const OVERLAP_PAIRS = overlapPairs();

const PROBE: unknown = parseJson(
  readFileSync(path.join(import.meta.dirname, 'fixtures/probe-findings.json'), 'utf8'),
);
const PROBE_SOURCES = fieldsOf(fieldOf(PROBE, 'sources'));
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
const KOTLIN_TOOL = 'kotlin-source/';
const E2E_EVIDENCE = {
  'line: kotlin-source/ChildCoroutineOutlivesResource over pmd/CoroutineEscapesTest': path.resolve(
    import.meta.dirname,
    '../kotlin-e2e/review-rules/kotlin-preset-review-rules-coroutines.e2e.test.mts',
  ),
  'line: checkstyle/FileTabCharacter over checkstyle/Indentation': path.resolve(
    import.meta.dirname,
    '../../maven/preset/maven-preset-checkstyle.e2e.test.mjs',
  ),
};
const roots: string[] = [];

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function policyApplied(
  findings: readonly JavaFinding[],
  policy: object,
  resolveOverlaps: (findings: readonly JavaFinding[]) => readonly JavaFinding[],
): unknown {
  return callUntyped(applyFindingPolicy, findings, policy, resolveOverlaps);
}

function probeSource(file: string): string | undefined {
  return optionalText(PROBE_SOURCES[file]);
}

function probeFindings(): JavaFinding[] {
  return findingsOf(
    listOf(fieldOf(PROBE, 'findings')).map((entry) => {
      const { line, ...finding } = fieldsOf(entry);
      return { ...finding, ...(line === undefined ? {} : { location: { line } }) };
    }),
  );
}

function resolvedProbe(): JavaFinding[] {
  return withoutOverlaps(probeFindings(), { readSource: probeSource });
}

function printedRule({ tool, rule }: JavaFinding): string {
  return `${tool}/${rule}`;
}

function droppedBy({ primary, secondary }: OverlapPair): JavaFinding[] {
  const own = probeFindings().filter((finding) =>
    [...primary, ...secondary].some((pattern) => matchesRule([pattern], printedRule(finding))),
  );
  const kept = new Set(withoutOverlaps(own, { readSource: probeSource }));
  return own.filter(
    (finding) => !kept.has(finding) && matchesRule(secondary, printedRule(finding)),
  );
}

function pairName({ primary, secondary, scope }: OverlapPair): string {
  return `${scope}: ${primary.join(', ')} over ${secondary.join(', ')}`;
}

function kotlinOnly({ primary, secondary }: OverlapPair): boolean {
  return [...primary, ...secondary].some((rule) => rule.startsWith(KOTLIN_TOOL));
}

function evidenceOf(pair: OverlapPair): string {
  return textOf(fieldOf(E2E_EVIDENCE, pairName(pair)));
}

function outsideProbe(pair: OverlapPair): boolean {
  return kotlinOnly(pair) || Object.hasOwn(E2E_EVIDENCE, pairName(pair));
}

function name(finding: JavaFinding): string {
  return `${path.basename(finding.path)}:${String(finding.location?.line ?? finding['symbol'])}`;
}

function sharedLines(findings: readonly JavaFinding[]): [string, string[]][] {
  const lines = Map.groupBy(
    findings.filter((finding) => finding.location !== undefined),
    (finding) => name(finding),
  );
  return [...lines]
    .filter(([, group]) => new Set(group.map(({ tool }) => tool)).size > 1)
    .map(([line, group]): [string, string[]] => [
      line,
      [...new Set(group.map(({ tool, rule }) => `${tool}/${rule}`))].sort(),
    ])
    .sort(([left], [right]) => left.localeCompare(right));
}

function reported(tool: string, rule: string): JavaFinding {
  return {
    tool,
    rule,
    path: 'src/A.java',
    identity: `${tool}-${rule}`,
    classification: 'enforceable',
    location: { line: 5 },
  };
}

describe('overlaps on the probe project', () => {
  it('leave two tools on one line only where they report different issues', () => {
    expect(sharedLines(resolvedProbe())).toStrictEqual([
      [
        'Arrays1.java:5',
        [
          'errorprone/ArrayEquals',
          'errorprone/ArrayHashCode',
          'errorprone/ArrayToString',
          'pmd/AddEmptyString',
        ],
      ],
      ['C3Locks.java:15', ['errorprone/LockOnBoxedPrimitive', 'pmd/AvoidSynchronizedStatement']],
      [
        'C4Switches.java:6',
        ['errorprone/StatementSwitchToExpressionSwitch', 'pmd/NonExhaustiveSwitch'],
      ],
      ['Encodings.java:9', ['errorprone/DefaultCharset', 'pmd/AvoidFileStream']],
      ['G12Worker.java:8', ['forbiddenapis/new-thread', 'pmd/ClassLoadEffect']],
      ['G13Guards.java:13', ['pmd/SqlConcatenation', 'spotbugs/SQL_INJECTION_JDBC']],
      ['G13Guards.java:19', ['pmd/SqlConcatenation', 'spotbugs/SQL_INJECTION_JDBC']],
      ['G2Stored.java:7', ['errorprone/NullAway', 'pmd/UseVarargs']],
      ['GuardOverlaps.java:38', ['checkstyle/MagicNumber', 'forbiddenapis/thread-sleep']],
      [
        'GuardOverlaps.java:42',
        ['forbiddenapis/java-deserialization', 'spotbugs/OBJECT_DESERIALIZATION'],
      ],
      [
        'Hiding.java:12',
        [
          'checkstyle/VisibilityModifier',
          'errorprone/HidingField',
          'spotbugs/URF_UNREAD_PUBLIC_OR_PROTECTED_FIELD',
        ],
      ],
      [
        'Hiding.java:4',
        ['checkstyle/VisibilityModifier', 'spotbugs/URF_UNREAD_PUBLIC_OR_PROTECTED_FIELD'],
      ],
      [
        'Hiding.java:8',
        ['checkstyle/VisibilityModifier', 'spotbugs/URF_UNREAD_PUBLIC_OR_PROTECTED_FIELD'],
      ],
      ['Locks.java:17', ['forbiddenapis/legacy-date-time', 'pmd/UnsynchronizedStaticFormatter']],
      ['Misc.java:23', ['errorprone/SynchronizeOnNonFinalField', 'pmd/AvoidSynchronizedStatement']],
      ['Numbers.java:10', ['checkstyle/MagicNumber', 'errorprone/ComparisonOutOfRange']],
      ['Numbers.java:12', ['errorprone/MathAbsoluteNegative', 'spotbugs/PREDICTABLE_RANDOM']],
      ['Numbers.java:7', ['checkstyle/MagicNumber', 'errorprone/BadShiftAmount']],
      ['Numbers.java:8', ['errorprone/RandomCast', 'spotbugs/PREDICTABLE_RANDOM']],
      [
        'Numbers.java:9',
        [
          'checkstyle/MagicNumber',
          'errorprone/RandomModInteger',
          'spotbugs/DMI_RANDOM_USED_ONLY_ONCE',
          'spotbugs/PREDICTABLE_RANDOM',
        ],
      ],
      ['Obsolete.java:10', ['errorprone/JdkObsolete', 'pmd/LooseCoupling']],
      ['Obsolete.java:11', ['errorprone/JdkObsolete', 'pmd/LooseCoupling']],
      ['Obsolete.java:12', ['errorprone/JdkObsolete', 'pmd/LooseCoupling']],
      ['Obsolete.java:13', ['errorprone/JdkObsolete', 'pmd/LooseCoupling']],
      ['OldTest.java:14', ['errorprone/RedundantNullCheck', 'pmd/SimplifiableTestAssertion']],
      ['P2Inner.java:10', ['forbiddenapis/legacy-date-time', 'pmd/UnsynchronizedStaticFormatter']],
      ['P2Inner.java:13', ['errorprone/ClassCanBeStatic', 'pmd/GenericTypeName']],
      ['P2Inner.java:6', ['checkstyle/VisibilityModifier', 'errorprone/NonFinalStaticField']],
      ['P2Inner.java:7', ['errorprone/NonFinalStaticField', 'pmd/LegacyCalendarApi']],
      [
        'P2Strings.java:21',
        [
          'errorprone/ClassNewInstance',
          'spotbugs/REFLC_REFLECTION_MAY_INCREASE_ACCESSIBILITY_OF_CLASS',
        ],
      ],
      ['P2Strings.java:26', ['checkstyle/MagicNumber', 'forbiddenapis/thread-sleep']],
      ['SelfAssign.java:7', ['errorprone/SelfAssignment', 'pmd/AvoidReassigningParameters']],
      ['Shared.java:16', ['forbiddenapis/legacy-date-time', 'pmd/UnsynchronizedStaticFormatter']],
      ['Skip.java:8', ['checkstyle/MagicNumber', 'pmd/CheckSkipResult']],
      ['Stamps.java:11', ['forbiddenapis/legacy-date-time', 'pmd/UnsynchronizedStaticFormatter']],
      [
        'StaticCtor.java:7',
        ['checkstyle/MagicNumber', 'spotbugs/ST_WRITE_TO_STATIC_FROM_INSTANCE_METHOD'],
      ],
      [
        'Types.java:7',
        [
          'checkstyle/MagicNumber',
          'errorprone/CollectionIncompatibleType',
          'errorprone/EqualsIncompatibleType',
        ],
      ],
      ['V1Style.java:10', ['checkstyle/VisibilityModifier', 'errorprone/MixedArrayDimensions']],
      ['V1Style.java:13', ['checkstyle/MagicNumber', 'errorprone/BigDecimalLiteralDouble']],
      [
        'V1Style.java:8',
        ['errorprone/AnnotationPosition', 'pmd/CompatibilityShim', 'spotbugs/SS_SHOULD_BE_STATIC'],
      ],
      ['V1Style.java:9', ['errorprone/LongLiteralLowerCaseSuffix', 'spotbugs/SS_SHOULD_BE_STATIC']],
      ['V3Unused.java:5', ['checkstyle/MagicNumber', 'pmd/UnusedLocalVariable']],
      ['V3Unused.java:6', ['checkstyle/MagicNumber', 'pmd/UnusedAssignment']],
    ]);
  });

  it('drop a secondary under every pair of the table, so each pair matches real findings', () => {
    expect(
      OVERLAP_PAIRS.filter((pair) => !outsideProbe(pair) && droppedBy(pair).length === 0).map(
        pairName,
      ),
    ).toStrictEqual([]);
  });

  it('leave the Kotlin pairs and the formatter-less layout pair to an e2e that runs both rules on one line', () => {
    const e2ePairs = OVERLAP_PAIRS.filter(outsideProbe);
    const unexercised = e2ePairs.flatMap((pair) => {
      const evidence = readFileSync(evidenceOf(pair), 'utf8');
      return [...pair.primary, ...pair.secondary].filter(
        (rule) => !evidence.includes(rule.split('/').at(-1) ?? ''),
      );
    });

    expect(e2ePairs.map(pairName)).toStrictEqual(Object.keys(E2E_EVIDENCE));
    expect(unexercised).toStrictEqual([]);
  });

  it('keep the cases only the secondary side covers', () => {
    expect(
      resolvedProbe()
        .filter(({ rule }) => PARTIAL.has(rule))
        .map((finding) => `${name(finding)} ${finding.rule}`)
        .sort(),
    ).toStrictEqual([
      'C1Arrays.java:21 EI_EXPOSE_REP',
      'C3Locks.java:21 RV_RETURN_VALUE_IGNORED',
      'C3Locks.java:22 RV_RETURN_VALUE_IGNORED',
      'C6Encoding.java:11 SS_SHOULD_BE_STATIC',
      'C6Encoding.java:16 DM_DEFAULT_ENCODING',
      'C8Equals.java:4 SS_SHOULD_BE_STATIC',
      'EqOnly.java:4 SS_SHOULD_BE_STATIC',
      'Fields.java:5 SS_SHOULD_BE_STATIC',
      'HashOnly.java:5 OverrideBothEqualsAndHashcode',
      'NullColl.java:18 ReturnEmptyCollectionRatherThanNull',
      'P2Eq.java:7 HE_EQUALS_USE_HASHCODE',
      'P3Fields.java:11 URF_UNREAD_FIELD',
      'P3Fields.java:probe.P3Fields.unusedPackage UUF_UNUSED_FIELD',
      'V1Style.java:8 SS_SHOULD_BE_STATIC',
      'V1Style.java:9 SS_SHOULD_BE_STATIC',
    ]);
  });
});

describe('overlaps after policy', () => {
  const primary = reported('errorprone', 'DefaultCharset');
  const secondary = reported('spotbugs', 'DM_DEFAULT_ENCODING');
  function resolve(findings: readonly JavaFinding[]): JavaFinding[] {
    return withoutOverlaps(findings);
  }

  it('report the secondary when the primary is excepted or not run', () => {
    const exceptions = [{ rule: 'errorprone/DefaultCharset', paths: ['src/A.java'] }];

    expect(policyApplied([primary, secondary], {}, resolve)).toStrictEqual([primary]);
    expect(policyApplied([primary, secondary], { exceptions }, resolve)).toStrictEqual([secondary]);
    expect(policyApplied([secondary], {}, resolve)).toStrictEqual([secondary]);
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

    expect(policyApplied([primary, secondary], policy, resolve)).toStrictEqual([]);
  });
});

describe('the overlap list in docs/java-preset.md', () => {
  it('is the pair table, in order', () => {
    function printed(rules: readonly string[]): string {
      return rules.map((rule) => `\`${rule}\``).join(', ');
    }
    const documented = guidePages('docs/java-preset.md')
      .map(guideText)
      .join('\n')
      .split('\n')
      .filter((line) =>
        /^- (?:line|member|javadoc|catch|class|field|file|variable): `/u.test(line),
      );

    expect(documented).toStrictEqual(
      OVERLAP_PAIRS.map(
        ({ primary, secondary, scope }) =>
          `- ${scope}: ${printed(primary)} over ${printed(secondary)}`,
      ),
    );
  });
});
