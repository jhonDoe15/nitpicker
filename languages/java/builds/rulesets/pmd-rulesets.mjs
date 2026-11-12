import { escapeXml } from '../../adapters/tool-config/xml-write.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { escapeRegExp } from '../../../../shared/paths/glob.mjs';
import { GRADLE_DIRECTORY } from '../java-build.mjs';
import { targetRelease } from '../lint/javac-options.mjs';

const PATTERN_MATCHING_RULES = ['InstanceofThenCast', 'CollectorsToList'];
const PATTERN_MATCHING_RELEASE = 16;
const DEFAULT_RELEASE = 8;
const RELEASE_MESSAGES = [
  {
    rule: 'OptionalGet',
    release: 10,
    message:
      'Use orElse(...), orElseThrow(Supplier), map or ifPresent instead of Optional.get(), also after isPresent().',
  },
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
        '  </rule>',
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

function messageReference(ruleset, { rule, message }) {
  return `  <rule ref="${escapeXml(`${ruleset}/${rule}`)}" message="${escapeXml(message)}"/>`;
}

export function scopedRuleset(
  name,
  ruleset,
  { directories, onlyThere = false, skipped = [], messages = [] },
) {
  const kind = onlyThere ? 'include' : 'exclude';
  return rulesetXml(name, {
    patterns: [
      ...(onlyThere ? ['  <exclude-pattern>.*</exclude-pattern>'] : []),
      ...directories.map((directory) => directoryPattern(kind, directory)),
    ],
    rules: [
      ...ruleReference(ruleset, [...skipped, ...messages.map(({ rule }) => rule)]),
      ...messages.map((message) => messageReference(ruleset, message)),
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

export function writeGuardRulesets({ reportDir, testDirectories, compiler }) {
  mkdirSync(reportDir, { recursive: true });
  const release = javaRelease(compiler);
  const skipped = release < PATTERN_MATCHING_RELEASE ? PATTERN_MATCHING_RULES : [];
  const messages = RELEASE_MESSAGES.filter((entry) => release < entry.release);
  const guards = scopedRuleset(
    'nitpicker-guards-main',
    path.join(GRADLE_DIRECTORY, 'rules/guards-ruleset.xml'),
    { directories: testDirectories, skipped, messages },
  );
  const existingTests = testDirectories.filter((directory) => existsSync(directory));
  const honesty = scopedRuleset(
    'nitpicker-test-honesty',
    path.join(GRADLE_DIRECTORY, 'rules/test-honesty-ruleset.xml'),
    { directories: existingTests, onlyThere: true },
  );
  return [
    written(reportDir, 'pmd-guards-main.xml', guards),
    ...(existingTests.length === 0 ? [] : [written(reportDir, 'pmd-test-honesty.xml', honesty)]),
  ];
}
