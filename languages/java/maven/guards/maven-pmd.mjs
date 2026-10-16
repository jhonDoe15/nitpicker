import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { escapeRegExp } from '../../../../shared/glob.mjs';
import { runJava } from '../maven-command.mjs';
import { targetRelease } from './javac-options.mjs';
import { EMPTY_SARIF } from '../maven-lint.mjs';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';

const PATTERN_MATCHING_RULES = ['InstanceofThenCast', 'CollectorsToList'];
const PATTERN_MATCHING_RELEASE = 16;
const MAVEN_DEFAULT_RELEASE = 8;
const CPD_EXITS = new Set([0, 4]);
const CPD_REPORT = 'cpd.xml';
const CPD_FAILURE = 'cpd-failed.txt';
const CPD_ROOT = /<pmd-cpd[\s/>]/u;
const TEST_CLASS_PATTERN = [
  String.raw`^(?:.*\.)?Test[^\.]*$`,
  String.raw`^(?:.*\.)?.*(?<!Arch|Architecture)Tests?$`,
  String.raw`^(?:.*\.)?.*TestCase$`,
].join('|');

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
  const major = majorVersion(targetRelease(compiler));
  return Number.isInteger(major) ? major : MAVEN_DEFAULT_RELEASE;
}

function testRulesOnTestSources(mainDirectories) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ruleset name="nitpicker-tests" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">',
    "  <description>Nitpicker's test-only rules on test sources only.</description>",
    ...mainDirectories.map((directory) => directoryPattern('exclude', directory)),
    '  <rule ref="category/java/errorprone.xml/TestClassWithoutTestCases">',
    '    <properties>',
    '      <property name="testClassPattern"',
    `                value="${escapeXml(TEST_CLASS_PATTERN)}"/>`,
    '    </properties>',
    '  </rule>',
    '</ruleset>',
    '',
  ].join('\n');
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
    scopedRuleset(
      'nitpicker-guards-main',
      path.join(GRADLE_DIRECTORY, 'rules/guards-ruleset.xml'),
      {
        directories: module.testSourceRoots,
        skipped,
      },
    ),
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
  const tests = writeRuleset(
    reportDir,
    'pmd-tests.xml',
    testRulesOnTestSources(module.sourceRoots),
  );
  return [
    ...(nitpicker ? [path.join(GRADLE_DIRECTORY, 'pmd-ruleset.xml')] : []),
    ...(configs.pmd.project === undefined ? [] : [configs.pmd.project]),
    ...(nitpicker ? [...guardRulesets(module, reportDir), tests] : []),
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

function cpdOutcome(result) {
  return CPD_EXITS.has(result.status) && CPD_ROOT.test(result.stdout)
    ? { kind: 'report', xml: result.stdout }
    : { kind: 'failed', exit: result.status ?? result.signal, stderr: result.stderr };
}

export function runCpd({ module, reportDir, tools }) {
  for (const stale of [CPD_REPORT, CPD_FAILURE]) {
    rmSync(path.join(reportDir, stale), { force: true });
  }
  const directories = [...module.sourceRoots, ...module.testSourceRoots].filter((root) =>
    existsSync(root),
  );
  if (directories.length === 0) {
    return;
  }
  const outcome = cpdOutcome(
    runJava({
      tool: 'PMD CPD',
      classpath: tools.pmd,
      args: [path.join(GRADLE_DIRECTORY, 'CpdReport.java'), ...directories],
      cwd: module.basedir,
    }),
  );
  if (outcome.kind === 'report') {
    writeFileSync(path.join(reportDir, CPD_REPORT), outcome.xml);
    return;
  }
  writeFileSync(path.join(reportDir, CPD_FAILURE), `${String(outcome.exit)}\n${outcome.stderr}`);
}
