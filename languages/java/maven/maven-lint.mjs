import { writeGuardRulesets } from '../builds/rulesets/pmd-rulesets.mjs';
import { guardCompiler } from './errorprone/maven-compiler.mjs';
import { withGuardChecks } from '../builds/rulesets/checkstyle-config.mjs';
import { nitpickerCheckstyleConfig } from './configuration/checkstyle-config.mjs';
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
import { javaCommand, runJava } from './maven-command.mjs';
import { GRADLE_DIRECTORY } from '../builds/java-build.mjs';
import { writeRulesets } from '../adapters/tool-config/pmd-wrappers.mjs';
import { layerCheckstyle } from '../adapters/tool-config/checkstyle/checkstyle-layers.mjs';
import { unformattedCheckstyle } from '../adapters/tool-config/checkstyle/unformatted-checks.mjs';
import { NITPICKER_RULESET } from '../adapters/tool-config/layer-files.mjs';

const LAYOUT_SUPPRESSIONS = 'checkstyle-suppressions.xml';
const UNFORMATTED_SUPPRESSIONS = 'checkstyle-suppressions-unformatted.xml';
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

export function runFormat({ module, reportDir, tools, javaStyle = 'google' }) {
  const report = path.join(reportDir, 'format.txt');
  const files = javaFiles([...module.sourceRoots, ...module.testSourceRoots]);
  const formatter = FORMATTERS[javaStyle];
  if (files.length === 0 || formatter === undefined) {
    writeFileSync(report, '');
    return;
  }
  const result = runJava({
    tool: formatter.tool,
    classpath: tools[formatter.classpath],
    jvmArgs: JAVAC_EXPORTS,
    mainClass: formatter.mainClass,
    args: [...formatter.flags, '--dry-run', ...files],
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

function propertiesLine(name, value) {
  return `${name}=${value.replaceAll('\\', '\\\\')}`;
}

function checkstyleSetup({ reportDir, tools, configs, pinned, style, test = false }) {
  const jar = tools.checkstyle.find(
    (entry) => path.basename(entry) === `checkstyle-${pinned.checkstyle}.jar`,
  );
  const bundled = nitpickerCheckstyleConfig(bundledGoogleChecks(jar));
  const unformatted = style?.javaStyle === 'none';
  return writeCheckstyleSetup({
    directory: path.join(reportDir, test ? 'checkstyle-test-config' : 'checkstyle-config'),
    nitpickerConfig: withGuardChecks(
      unformatted ? unformattedCheckstyle(bundled, style.indentation) : bundled,
      ['checkstyle-all.xml', ...(test ? [] : ['checkstyle-main.xml'])],
    ),
    suppressions: unformatted ? UNFORMATTED_SUPPRESSIONS : LAYOUT_SUPPRESSIONS,
    ...configs.checkstyle,
  });
}

export function writeCheckstyleSetup({
  directory,
  nitpickerConfig,
  project,
  projectWins,
  suppressions = LAYOUT_SUPPRESSIONS,
}) {
  mkdirSync(directory, { recursive: true });
  const config = path.join(directory, 'checkstyle.xml');
  writeFileSync(
    config,
    project === undefined
      ? nitpickerConfig
      : layerCheckstyle({
          nitpickerText: nitpickerConfig,
          projectText: readFileSync(project, 'utf8'),
          projectWins,
        }),
  );
  const properties = path.join(directory, 'checkstyle.properties');
  writeFileSync(
    properties,
    [
      ...(project === undefined ? [] : [propertiesLine('config_loc', path.dirname(project))]),
      propertiesLine(
        'org.checkstyle.google.suppressionfilter.config',
        path.join(GRADLE_DIRECTORY, suppressions),
      ),
    ].join('\n'),
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

export function runCheckstyle({ module, reportDir, tools, configs, pinned, style }) {
  const context = {
    module,
    tools,
    pinned,
    setup: checkstyleSetup({ reportDir, tools, configs, pinned, style }),
  };
  checkstyleReport({
    ...context,
    roots: module.sourceRoots,
    report: path.join(reportDir, 'checkstyle.xml'),
    always: true,
  });
  checkstyleReport({
    ...context,
    setup: checkstyleSetup({ reportDir, tools, configs, pinned, style, test: true }),
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
    }),
  ];
}
