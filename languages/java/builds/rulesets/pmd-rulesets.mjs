import { escapeXml } from '../../adapters/tool-config/xml-write.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { escapeRegExp } from '../../../../shared/paths/glob.mjs';
import { GRADLE_DIRECTORY } from '../java-build.mjs';
import { targetRelease } from '../lint/javac-options.mjs';

const PATTERN_MATCHING_RULES = ['InstanceofThenCast', 'CollectorsToList'];
const PATTERN_MATCHING_RELEASE = 16;
const DEFAULT_RELEASE = 8;
const TEST_CLASS_PATTERN = [
  String.raw`^(?:.*\.)?Test[^\.]*$`,
  String.raw`^(?:.*\.)?.*(?&lt;!Arch|Architecture)Tests?$`,
  String.raw`^(?:.*\.)?.*TestCase$`,
].join('|');
const RULE_END = '  </rule>';
const SPRING_DATA_OVERRIDES = [{ rule: 'IoCallInLoop', properties: { springData: true } }];
const TEST_CLASS_RULE = [
  '  <rule ref="category/java/errorprone.xml/TestClassWithoutTestCases">',
  '    <properties>',
  '      <property name="testClassPattern"',
  `                value="${TEST_CLASS_PATTERN}"/>`,
  '    </properties>',
  RULE_END,
];

function directoryPattern(kind, directory) {
  const pattern = `${escapeRegExp(directory + path.sep)}.*`;
  return `  <${kind}-pattern>${escapeXml(pattern)}</${kind}-pattern>`;
}

function ruleReference(ruleset, skipped) {
  const ref = escapeXml(ruleset);
  return skipped.length === 0
    ? [`  <rule ref="${ref}"/>`]
    : [
        `  <rule ref="${ref}">`,
        ...skipped.map((name) => `    <exclude name="${name}"/>`),
        RULE_END,
      ];
}

function propertyOverride(ruleset, { rule, properties }) {
  return [
    `  <rule ref="${escapeXml(`${ruleset}/${rule}`)}">`,
    '    <properties>',
    ...Object.entries(properties).map(
      ([name, value]) => `      <property name="${name}" value="${escapeXml(String(value))}"/>`,
    ),
    '    </properties>',
    RULE_END,
  ];
}

function rulesetXml(name, { patterns, rules }) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<ruleset name="${name}" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">`,
    `  <description>${name}</description>`,
    ...patterns,
    ...rules,
    '</ruleset>',
    '',
  ].join('\n');
}

export function scopedRuleset(name, ruleset, options) {
  const { directories, onlyThere = false, skipped = [], overrides = [] } = options;
  const kind = onlyThere ? 'include' : 'exclude';
  return rulesetXml(name, {
    patterns: [
      ...(onlyThere ? ['  <exclude-pattern>.*</exclude-pattern>'] : []),
      ...directories.map((directory) => directoryPattern(kind, directory)),
    ],
    rules: [
      ...ruleReference(ruleset, [...skipped, ...overrides.map(({ rule }) => rule)]),
      ...overrides.flatMap((override) => propertyOverride(ruleset, override)),
    ],
  });
}

function majorVersion(version) {
  const parts = String(version).split('.');
  return Number(parts[0] === '1' ? parts[1] : parts[0]);
}

export function javaRelease(compiler) {
  const major = majorVersion(targetRelease(compiler));
  return Number.isInteger(major) ? major : DEFAULT_RELEASE;
}

function written(reportDir, file, content) {
  const target = path.join(reportDir, path.basename(file));
  writeFileSync(target, content);
  return target;
}

const TEST_ONLY_RULESETS = [
  ['code-smells-test', 'code-smells-test-ruleset.xml'],
  ['test-honesty', 'rules/test-honesty-ruleset.xml'],
];

function testOnlyRulesets(reportDir, testDirectories) {
  const existingTests = testDirectories.filter((directory) => existsSync(directory));
  if (existingTests.length === 0) {
    return [];
  }
  return TEST_ONLY_RULESETS.map(([name, file]) =>
    written(
      reportDir,
      `pmd-${name}.xml`,
      scopedRuleset(`nitpicker-${name}`, path.join(GRADLE_DIRECTORY, file), {
        directories: existingTests,
        onlyThere: true,
      }),
    ),
  );
}

export function writeGuardRulesets({ reportDir, testDirectories, compiler, spring }) {
  const skipped = javaRelease(compiler) < PATTERN_MATCHING_RELEASE ? PATTERN_MATCHING_RULES : [];
  const guards = scopedRuleset(
    'nitpicker-guards-main',
    path.join(GRADLE_DIRECTORY, 'rules/guards-ruleset.xml'),
    { directories: testDirectories, skipped },
  );
  const smells = scopedRuleset(
    'nitpicker-code-smells-main',
    path.join(GRADLE_DIRECTORY, 'code-smells-ruleset.xml'),
    { directories: testDirectories, overrides: spring ? SPRING_DATA_OVERRIDES : [] },
  );
  return [
    written(reportDir, 'pmd-guards-main.xml', guards),
    written(reportDir, 'pmd-code-smells-main.xml', smells),
    ...testOnlyRulesets(reportDir, testDirectories),
  ];
}

function nitpickerExtras(plan) {
  const { reportDir, mainDirectories, testDirectories, spring } = plan;
  const guards = writeGuardRulesets(plan);
  const tests = rulesetXml('nitpicker-tests', {
    patterns: mainDirectories.map((directory) => directoryPattern('exclude', directory)),
    rules: TEST_CLASS_RULE,
  });
  const springMain = scopedRuleset(
    'nitpicker-spring-main',
    path.join(GRADLE_DIRECTORY, 'spring-ruleset.xml'),
    { directories: testDirectories },
  );
  return [
    ...guards,
    written(reportDir, 'pmd-tests.xml', tests),
    ...(spring ? [written(reportDir, 'pmd-spring-main.xml', springMain)] : []),
  ];
}

export function writePmdRulesets(plan) {
  mkdirSync(plan.reportDir, { recursive: true });
  const nitpicker = plan.nitpicker ? [path.join(GRADLE_DIRECTORY, 'pmd-ruleset.xml')] : [];
  return [
    ...nitpicker,
    ...(plan.project === undefined ? [] : [plan.project]),
    ...(plan.nitpicker ? nitpickerExtras(plan) : []),
  ];
}
