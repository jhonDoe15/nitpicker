import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { escapeRegExp } from '../../../shared/glob.mjs';
import { javaCommand, runJava } from './maven-command.mjs';
import { GRADLE_DIRECTORY } from '../builds/java-build.mjs';

const EMPTY_SARIF = '{"version":"2.1.0","runs":[]}';
const INLINE_CHECKSTYLE_FILTERS = [
  'SuppressWarningsFilter',
  'SuppressWarningsHolder',
  'SuppressionCommentFilter',
  'SuppressWithNearbyCommentFilter',
  'SuppressWithNearbyTextFilter',
  'SuppressionXpathFilter',
];
const JAVAC_EXPORTS = ['api', 'file', 'parser', 'tree', 'util', 'code'].map(
  (name) => `--add-exports=jdk.compiler/com.sun.tools.javac.${name}=ALL-UNNAMED`,
);

export function javaFiles(roots) {
  return roots
    .filter((root) => existsSync(root))
    .flatMap((root) =>
      readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
        .map((entry) => path.join(entry.parentPath, entry.name)),
    )
    .sort();
}

function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function scopedRuleset({ name, ruleset, roots, onlyThere }) {
  const kind = onlyThere ? 'include' : 'exclude';
  const patterns = roots.map(
    (root) =>
      `  <${kind}-pattern>${escapeXml(`${escapeRegExp(root + path.sep)}.*`)}</${kind}-pattern>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<ruleset name="${name}" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">`,
    `  <description>${name}</description>`,
    ...(onlyThere ? ['  <exclude-pattern>.*</exclude-pattern>'] : []),
    ...patterns,
    `  <rule ref="${escapeXml(path.join(GRADLE_DIRECTORY, ruleset))}"/>`,
    '</ruleset>',
    '',
  ].join('\n');
}

function writeRuleset(reportDir, scope) {
  const file = path.join(reportDir, `pmd-${scope.name}.xml`);
  writeFileSync(file, scopedRuleset(scope));
  return file;
}

function nitpickerRulesets({ module, reportDir, spring, linted }) {
  const testRoots = module.testSourceRoots.filter((root) => linted.includes(root));
  const mainOnly = { roots: module.testSourceRoots, onlyThere: false };
  const springMain = { name: 'spring-main', ruleset: 'spring-ruleset.xml', ...mainOnly };
  const smellsMain = { name: 'code-smells-main', ruleset: 'code-smells-ruleset.xml', ...mainOnly };
  const smellsTest = {
    name: 'code-smells-test',
    ruleset: 'code-smells-test-ruleset.xml',
    roots: testRoots,
    onlyThere: true,
  };
  return [
    path.join(GRADLE_DIRECTORY, 'pmd-ruleset.xml'),
    writeRuleset(reportDir, smellsMain),
    ...(testRoots.length > 0 ? [writeRuleset(reportDir, smellsTest)] : []),
    ...(spring ? [writeRuleset(reportDir, springMain)] : []),
  ];
}

function writeAuxClasspath({ module, reportDir, classpaths }) {
  const file = path.join(reportDir, 'pmd-aux-classpath.txt');
  const entries = new Set([
    ...classpaths.mainCompile,
    ...classpaths.testCompile,
    module.outputDirectory,
    module.testOutputDirectory,
  ]);
  writeFileSync(file, [...entries].filter((entry) => existsSync(entry)).join('\n'));
  return file;
}

export function runPmd({ module, reportDir, tools, classpaths, configs, spring }) {
  const report = path.join(reportDir, 'pmd.sarif');
  const linted = [...module.sourceRoots, ...module.testSourceRoots].filter((root) =>
    existsSync(root),
  );
  if (linted.length === 0) {
    writeFileSync(report, EMPTY_SARIF);
    return;
  }
  const auxClasspath = writeAuxClasspath({ module, reportDir, classpaths });
  const rulesets = [
    ...(configs.pmd.nitpicker ? nitpickerRulesets({ module, reportDir, spring, linted }) : []),
    ...(configs.pmd.project === undefined ? [] : [configs.pmd.project]),
  ];
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
      rulesets.join(','),
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

export function runSpotbugs({ module, reportDir, tools }) {
  const report = path.join(reportDir, 'spotbugs.sarif');
  const hasClasses =
    existsSync(module.outputDirectory) && readdirSync(module.outputDirectory).length > 0;
  if (!hasClasses) {
    writeFileSync(report, EMPTY_SARIF);
    return;
  }
  runJava({
    tool: 'SpotBugs',
    classpath: tools.spotbugs,
    mainClass: 'edu.umd.cs.findbugs.FindBugs2',
    args: [
      '-effort:default',
      '-medium',
      '-sarif',
      '-output',
      report,
      '-sourcepath',
      module.sourceRoots.filter((root) => existsSync(root)).join(path.delimiter),
      module.outputDirectory,
    ],
    cwd: module.basedir,
    accept: () => existsSync(report),
  });
}

export function runFormat({ module, reportDir, tools }) {
  const report = path.join(reportDir, 'format.txt');
  const files = javaFiles([...module.sourceRoots, ...module.testSourceRoots]);
  if (files.length === 0) {
    writeFileSync(report, '');
    return;
  }
  const result = runJava({
    tool: 'google-java-format',
    classpath: tools.format,
    jvmArgs: JAVAC_EXPORTS,
    mainClass: 'com.google.googlejavaformat.java.Main',
    args: ['--dry-run', ...files],
    cwd: module.basedir,
  });
  writeFileSync(report, result.stdout);
}

function bundledGoogleChecks(checkstyleJar) {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-checkstyle-'));
  try {
    const result = spawnSync(javaCommand('jar'), ['xf', checkstyleJar, 'google_checks.xml'], {
      cwd: directory,
      encoding: 'utf8',
    });
    const file = path.join(directory, 'google_checks.xml');
    if (result.status !== 0 || !existsSync(file)) {
      throw new Error(`could not read google_checks.xml from ${checkstyleJar}: ${result.stderr}`);
    }
    return readFileSync(file, 'utf8');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function nitpickerCheckstyleConfig(bundled) {
  const text = INLINE_CHECKSTYLE_FILTERS.reduce(
    (current, name) =>
      current.replaceAll(
        new RegExp(`<module name="${name}"\\s*(?:/>|>[\\s\\S]*?</module>)`, 'gu'),
        '',
      ),
    bundled,
  );
  const left = INLINE_CHECKSTYLE_FILTERS.filter((name) => text.includes(`"${name}"`));
  if (left.length > 0) {
    throw new Error(`nitpicker could not remove ${left.join(', ')} from google_checks.xml`);
  }
  return text;
}

function propertiesLine(name, value) {
  return `${name}=${value.replaceAll('\\', '\\\\')}`;
}

function checkstyleSetup({ reportDir, tools, configs, pinned }) {
  const directory = path.join(reportDir, 'checkstyle-config');
  mkdirSync(directory, { recursive: true });
  const properties = path.join(directory, 'checkstyle.properties');
  if (configs.checkstyle.project !== undefined) {
    writeFileSync(
      properties,
      propertiesLine('config_loc', path.dirname(configs.checkstyle.project)),
    );
    return { config: configs.checkstyle.project, properties };
  }
  const jar = tools.checkstyle.find(
    (entry) => path.basename(entry) === `checkstyle-${pinned.checkstyle}.jar`,
  );
  const config = path.join(directory, 'checkstyle.xml');
  writeFileSync(config, nitpickerCheckstyleConfig(bundledGoogleChecks(jar)));
  writeFileSync(
    properties,
    propertiesLine(
      'org.checkstyle.google.suppressionfilter.config',
      path.join(GRADLE_DIRECTORY, 'checkstyle-suppressions.xml'),
    ),
  );
  return { config, properties };
}

function checkstyleReport({ module, setup, tools, pinned, roots, report, always }) {
  const files = javaFiles(roots);
  if (files.length === 0) {
    if (always) {
      writeFileSync(report, `<checkstyle version="${pinned.checkstyle}"></checkstyle>`);
    }
    return;
  }
  runJava({
    tool: 'Checkstyle',
    classpath: tools.checkstyle,
    mainClass: 'com.puppycrawl.tools.checkstyle.Main',
    args: ['-c', setup.config, '-p', setup.properties, '-f', 'xml', '-o', report, ...files],
    cwd: module.basedir,
    accept: () => existsSync(report),
  });
}

export function runCheckstyle({ module, reportDir, tools, configs, pinned }) {
  const context = {
    module,
    tools,
    pinned,
    setup: checkstyleSetup({ reportDir, tools, configs, pinned }),
  };
  checkstyleReport({
    ...context,
    roots: module.sourceRoots,
    report: path.join(reportDir, 'checkstyle.xml'),
    always: true,
  });
  checkstyleReport({
    ...context,
    roots: module.testSourceRoots,
    report: path.join(reportDir, 'checkstyle-test.xml'),
    always: false,
  });
}
