import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../java-build.mts';
import { targetRelease } from '../lint/javac-options.mts';
import type { LintCompiler } from '../typed/lint-plan.mts';
import { escapeRegExp } from '../typed/regex-views.mts';
import { escapeXml } from '../typed/xml-views.mts';

const PATTERN_MATCHING_RULES = ['InstanceofThenCast', 'CollectorsToList'];
const PATTERN_MATCHING_RELEASE = 16;
const DEFAULT_RELEASE = 8;
type RuleMessage = { readonly rule: string; readonly release?: number; readonly message: string };

const RELEASE_MESSAGES: readonly (RuleMessage & { readonly release: number })[] = [
  {
    rule: 'OptionalGet',
    release: 10,
    message: 'Use orElse(...), orElseThrow(Supplier), map or ifPresent instead of Optional.get().',
  },
];

function directoryPattern(kind: string, directory: string): string {
  const pattern = `${escapeRegExp(directory + path.sep)}.*`;
  return `  <${kind}-pattern>${escapeXml(pattern)}</${kind}-pattern>`;
}

function ruleReference(ruleset: string, skipped: readonly string[]): string[] {
  const ref = escapeXml(ruleset);
  return skipped.length === 0
    ? [`  <rule ref="${ref}"/>`]
    : [
        `  <rule ref="${ref}">`,
        ...skipped.map((name) => `    <exclude name="${name}"/>`),
        '  </rule>',
      ];
}

function rulesetXml(
  name: string,
  { patterns, rules }: { readonly patterns: readonly string[]; readonly rules: readonly string[] },
): string {
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

function messageReference(ruleset: string, { rule, message }: RuleMessage): string {
  return `  <rule ref="${escapeXml(`${ruleset}/${rule}`)}" message="${escapeXml(message)}"/>`;
}

export function scopedRuleset(
  name: string,
  ruleset: string,
  {
    directories,
    onlyThere,
    skipped = [],
    messages = [],
  }: {
    readonly directories: readonly string[];
    readonly onlyThere?: true;
    readonly skipped?: readonly string[];
    readonly messages?: readonly RuleMessage[];
  },
): string {
  const only = onlyThere === true;
  const kind = only ? 'include' : 'exclude';
  return rulesetXml(name, {
    patterns: [
      ...(only ? ['  <exclude-pattern>.*</exclude-pattern>'] : []),
      ...directories.map((directory) => directoryPattern(kind, directory)),
    ],
    rules: [
      ...ruleReference(ruleset, [...skipped, ...messages.map(({ rule }) => rule)]),
      ...messages.map((message) => messageReference(ruleset, message)),
    ],
  });
}

function majorVersion(version: unknown): number {
  const parts = String(version).split('.');
  return Number(parts[0] === '1' ? parts[1] : parts[0]);
}

export function javaRelease(compiler: LintCompiler): number {
  const major = majorVersion(targetRelease(compiler));
  return Number.isInteger(major) ? major : DEFAULT_RELEASE;
}

function written(reportDir: string, file: string, content: string): string {
  const target = path.join(reportDir, path.basename(file));
  writeFileSync(target, content);
  return target;
}

export function writeGuardRulesets({
  reportDir,
  testDirectories,
  compiler,
}: {
  readonly reportDir: string;
  readonly testDirectories: readonly string[];
  readonly compiler: LintCompiler;
}): string[] {
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
