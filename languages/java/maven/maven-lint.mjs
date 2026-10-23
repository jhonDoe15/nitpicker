import { writeGuardRulesets } from '../builds/rulesets/pmd-rulesets.mjs';
import { guardCompiler } from './pom/compiler-settings.mjs';
import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from './maven-command.mjs';
import { writeRulesets } from '../adapters/tool-config/pmd-wrappers.mjs';
import { NITPICKER_RULESET } from '../adapters/tool-config/layer-files.mjs';
import { checkstyleSetup } from './configuration/checkstyle-setup.mjs';
import {
  CHECKSTYLE_SKIPPED,
  FORMAT_SKIPPED,
} from '../adapters/reporting/outcomes/skipped-tools.mjs';
import { CHECKSTYLE, GOOGLE_JAVA_FORMAT, toolJava } from './errorprone/maven-jdk.mjs';

const EMPTY_SARIF = '{"version":"2.1.0","runs":[]}';
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

export function runPmd({ module, reportDir, tools, classpaths, configs, spring, spawn }) {
  const report = path.join(reportDir, 'pmd.sarif');
  const linted = [...module.sourceRoots, ...module.testSourceRoots].filter((root) =>
    existsSync(root),
  );
  if (linted.length === 0) {
    writeFileSync(report, EMPTY_SARIF);
    return;
  }
  const auxClasspath = writeAuxClasspath({ module, reportDir, classpaths });
  const rulesets = pmdRulesets({ module, reportDir, configs, spring });
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
    spawn,
  });
}

export function runSpotbugs({ module, reportDir, tools, spawn }) {
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
    spawn,
  });
}

const GOOGLE_FORMAT = {
  tool: 'google-java-format',
  classpath: 'format',
  mainClass: 'com.google.googlejavaformat.java.Main',
  flags: [],
};
const FORMATTERS = {
  google: GOOGLE_FORMAT,
  aosp: { ...GOOGLE_FORMAT, flags: ['--aosp'] },
  palantir: {
    tool: 'palantir-java-format',
    classpath: 'format-palantir',
    mainClass: 'com.palantir.javaformat.java.Main',
    flags: ['--palantir'],
  },
};

export function runFormat({ module, reportDir, tools, javaStyle = 'google', spawn }) {
  const report = path.join(reportDir, 'format.txt');
  const skipped = path.join(reportDir, FORMAT_SKIPPED);
  rmSync(skipped, { force: true });
  const files = javaFiles([...module.sourceRoots, ...module.testSourceRoots]);
  const formatter = FORMATTERS[javaStyle];
  if (files.length === 0 || formatter === undefined) {
    writeFileSync(report, '');
    return;
  }
  const { java, problem } = toolJava({ ...GOOGLE_JAVA_FORMAT, spawn });
  if (problem !== undefined) {
    writeFileSync(report, '');
    writeFileSync(skipped, `${problem}\n`);
    return;
  }
  const result = runJava({
    java,
    tool: formatter.tool,
    classpath: tools[formatter.classpath],
    jvmArgs: JAVAC_EXPORTS,
    mainClass: formatter.mainClass,
    args: [...formatter.flags, '--dry-run', ...files],
    cwd: module.basedir,
    spawn,
  });
  writeFileSync(report, result.stdout);
}

function emptyCheckstyleReport(report, pinned) {
  writeFileSync(report, `<checkstyle version="${pinned.checkstyle}"></checkstyle>`);
}

function checkstyleReport({ module, setup, tools, pinned, roots, report, always, spawn }) {
  const files = javaFiles(roots);
  if (files.length === 0 || setup.java === undefined) {
    if (always) {
      emptyCheckstyleReport(report, pinned);
    }
    return;
  }
  runJava({
    java: setup.java,
    tool: 'Checkstyle',
    classpath: tools.checkstyle,
    mainClass: 'com.puppycrawl.tools.checkstyle.Main',
    args: ['-c', setup.config, '-p', setup.properties, '-f', 'xml', '-o', report, ...files],
    cwd: module.basedir,
    accept: () => existsSync(report),
    spawn,
  });
}

function checkstyleJava(reportDir, module, spawn) {
  const skipped = path.join(reportDir, CHECKSTYLE_SKIPPED);
  rmSync(skipped, { force: true });
  if (javaFiles([...module.sourceRoots, ...module.testSourceRoots]).length === 0) {
    return undefined;
  }
  const { java, problem } = toolJava({ ...CHECKSTYLE, spawn });
  if (problem !== undefined) {
    writeFileSync(skipped, `${problem}\n`);
  }
  return java;
}

export function runCheckstyle({ module, reportDir, tools, configs, pinned, style, spawn }) {
  const java = checkstyleJava(reportDir, module, spawn);
  function setup(test) {
    return { ...checkstyleSetup({ reportDir, tools, configs, pinned, style, spawn, test }), java };
  }
  const context = { module, tools, pinned, spawn, setup: setup(false) };
  checkstyleReport({
    ...context,
    roots: module.sourceRoots,
    report: path.join(reportDir, 'checkstyle.xml'),
    always: true,
  });
  checkstyleReport({
    ...context,
    setup: setup(true),
    roots: module.testSourceRoots,
    report: path.join(reportDir, 'checkstyle-test.xml'),
    always: false,
  });
}

function pmdRulesets({ module, reportDir, configs, spring }) {
  const { mainRuleset, testsRuleset, layers } = writeRulesets({
    module,
    reportDir,
    configs,
    spring,
  });
  return [
    layers.nitpicker ?? NITPICKER_RULESET,
    ...(layers.project === undefined ? [] : [layers.project]),
    testsRuleset,
    mainRuleset,
    ...writeGuardRulesets({
      reportDir,
      mainDirectories: module.sourceRoots,
      testDirectories: module.testSourceRoots,
      compiler: guardCompiler(module.compiler),
      spring,
    }),
  ];
}
