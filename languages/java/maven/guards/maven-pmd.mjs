import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { escapeRegExp } from '../../../../shared/glob.mjs';
import { runJava } from '../maven-command.mjs';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';

const EMPTY_SARIF = '{"version":"2.1.0","runs":[]}';
const PATTERN_MATCHING_RULES = ['InstanceofThenCast', 'CollectorsToList'];
const PATTERN_MATCHING_RELEASE = 16;
const MAVEN_DEFAULT_RELEASE = 8;
const CPD_FINDINGS_EXIT = 4;

function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

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

export function scopedRuleset(name, ruleset, { directories, onlyThere = false, skipped = [] }) {
  const kind = onlyThere ? 'include' : 'exclude';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<ruleset name="${name}" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">`,
    `  <description>${name}</description>`,
    ...(onlyThere ? ['  <exclude-pattern>.*</exclude-pattern>'] : []),
    ...directories.map((directory) => directoryPattern(kind, directory)),
    ...ruleReference(ruleset, skipped),
    '</ruleset>',
    '',
  ].join('\n');
}

function majorVersion(version) {
  const parts = String(version).split('.');
  return Number(parts[0] === '1' ? parts[1] : parts[0]);
}

export function javaRelease(compiler) {
  const version = compiler.release ?? compiler.target;
  return version === undefined ? MAVEN_DEFAULT_RELEASE : majorVersion(version);
}

function writeRuleset(reportDir, file, content) {
  const target = path.join(reportDir, file);
  writeFileSync(target, content);
  return target;
}

function guardRulesets(module, reportDir) {
  const skipped =
    javaRelease(module.compiler) < PATTERN_MATCHING_RELEASE ? PATTERN_MATCHING_RULES : [];
  const guards = writeRuleset(
    reportDir,
    'pmd-guards-main.xml',
    scopedRuleset('nitpicker-guards-main', path.join(GRADLE_DIRECTORY, 'rules/guards-ruleset.xml'), {
      directories: module.testSourceRoots,
      skipped,
    }),
  );
  const tests = module.testSourceRoots.filter((root) => existsSync(root));
  if (tests.length === 0) {
    return [guards];
  }
  const honesty = scopedRuleset(
    'nitpicker-test-honesty',
    path.join(GRADLE_DIRECTORY, 'rules/test-honesty-ruleset.xml'),
    { directories: tests, onlyThere: true },
  );
  return [guards, writeRuleset(reportDir, 'pmd-test-honesty.xml', honesty)];
}

function writeAuxClasspath({ module, reportDir, classpaths }) {
  const entries = new Set([
    ...classpaths.mainCompile,
    ...classpaths.testCompile,
    module.outputDirectory,
    module.testOutputDirectory,
  ]);
  return writeRuleset(
    reportDir,
    'pmd-aux-classpath.txt',
    [...entries].filter((entry) => existsSync(entry)).join('\n'),
  );
}

function pmdRulesets({ module, reportDir, configs, spring }) {
  const nitpicker = configs.pmd.nitpicker;
  const springMain = writeRuleset(
    reportDir,
    'pmd-spring-main.xml',
    scopedRuleset('nitpicker-spring-main', path.join(GRADLE_DIRECTORY, 'spring-ruleset.xml'), {
      directories: module.testSourceRoots,
    }),
  );
  return [
    ...(nitpicker ? [path.join(GRADLE_DIRECTORY, 'pmd-ruleset.xml')] : []),
    ...(configs.pmd.project === undefined ? [] : [configs.pmd.project]),
    ...(nitpicker ? guardRulesets(module, reportDir) : []),
    ...(nitpicker && spring ? [springMain] : []),
  ];
}

export function runPmd(context) {
  const { module, reportDir, tools } = context;
  const report = path.join(reportDir, 'pmd.sarif');
  const linted = [...module.sourceRoots, ...module.testSourceRoots].filter((root) =>
    existsSync(root),
  );
  if (linted.length === 0) {
    writeFileSync(report, EMPTY_SARIF);
    return;
  }
  const auxClasspath = writeAuxClasspath(context);
  runJava({
    tool: 'PMD',
    classpath: tools.pmd,
    mainClass: 'net.sourceforge.pmd.cli.PmdCli',
    args: [
      'check',
      '--no-cache',
      '--no-progress',
      '--format',
      'sarif',
      '--report-file',
      report,
      '--rulesets',
      pmdRulesets(context).join(','),
      '--aux-classpath',
      `file:${auxClasspath}`,
      '--suppress-marker',
      'NITPICKER-NO-INLINE-SUPPRESSION',
      '--dir',
      linted.join(','),
    ],
    cwd: module.basedir,
    accept: () => existsSync(report),
  });
}

export function runCpd({ module, reportDir, tools }) {
  const directories = [...module.sourceRoots, ...module.testSourceRoots].filter((root) =>
    existsSync(root),
  );
  if (directories.length === 0) {
    return;
  }
  const result = runJava({
    tool: 'PMD CPD',
    classpath: tools.pmd,
    mainClass: 'net.sourceforge.pmd.cli.PmdCli',
    args: [
      'cpd',
      '--minimum-tokens',
      '100',
      '--ignore-identifiers',
      '--ignore-literals',
      '--language',
      'java',
      '--format',
      'xml',
      '--no-fail-on-error',
      ...directories.flatMap((directory) => ['--dir', directory]),
    ],
    cwd: module.basedir,
    accept: ({ status }) => status === 0 || status === CPD_FINDINGS_EXIT,
  });
  writeFileSync(path.join(reportDir, 'cpd.xml'), result.stdout);
}
