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

export const EMPTY_SARIF = '{"version":"2.1.0","runs":[]}';
const TREE_WALKER = '<module name="TreeWalker">';
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
  const files = roots
    .filter((root) => existsSync(root))
    .flatMap((root) =>
      readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
        .map((entry) => path.join(entry.parentPath, entry.name)),
    );
  return [...new Set(files)].sort();
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

function checkstyleRuleModules(file) {
  const text = readFileSync(path.join(GRADLE_DIRECTORY, 'rules', file), 'utf8');
  return /<modules>([\s\S]*)<\/modules>/u.exec(text)[1];
}

export function withGuardChecks(config, files) {
  if (!config.includes(TREE_WALKER)) {
    throw new Error('nitpicker could not find TreeWalker in google_checks.xml');
  }
  const modules = files.map((file) => checkstyleRuleModules(file)).join('\n');
  return config.replace(TREE_WALKER, () => `${TREE_WALKER}\n${modules}`);
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
    return { main: configs.checkstyle.project, test: configs.checkstyle.project, properties };
  }
  const jar = tools.checkstyle.find(
    (entry) => path.basename(entry) === `checkstyle-${pinned.checkstyle}.jar`,
  );
  const bundled = nitpickerCheckstyleConfig(bundledGoogleChecks(jar));
  const main = path.join(directory, 'checkstyle.xml');
  const test = path.join(directory, 'checkstyle-test.xml');
  writeFileSync(main, withGuardChecks(bundled, ['checkstyle-all.xml', 'checkstyle-main.xml']));
  writeFileSync(test, withGuardChecks(bundled, ['checkstyle-all.xml']));
  writeFileSync(
    properties,
    propertiesLine(
      'org.checkstyle.google.suppressionfilter.config',
      path.join(GRADLE_DIRECTORY, 'checkstyle-suppressions.xml'),
    ),
  );
  return { main, test, properties };
}

function checkstyleReport({ module, config, setup, tools, pinned, roots, report, always }) {
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
    args: ['-c', config, '-p', setup.properties, '-f', 'xml', '-o', report, ...files],
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
    config: context.setup.main,
    roots: module.sourceRoots,
    report: path.join(reportDir, 'checkstyle.xml'),
    always: true,
  });
  checkstyleReport({
    ...context,
    config: context.setup.test,
    roots: module.testSourceRoots,
    report: path.join(reportDir, 'checkstyle-test.xml'),
    always: false,
  });
}
