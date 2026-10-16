import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from './maven-command.mjs';
import { GRADLE_DIRECTORY } from '../builds/java-build.mjs';
import { writeCheckstyleConfigs } from '../builds/rulesets/checkstyle-config.mjs';
import { FORMAT_SKIPPED } from '../adapters/reporting/outcomes/skipped-tools.mjs';
import { GOOGLE_JAVA_FORMAT, toolJava } from './errorprone/maven-jdk.mjs';

export const EMPTY_SARIF = '{"version":"2.1.0","runs":[]}';
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
  const skipped = path.join(reportDir, FORMAT_SKIPPED);
  rmSync(skipped, { force: true });
  const files = javaFiles([...module.sourceRoots, ...module.testSourceRoots]);
  if (files.length === 0) {
    writeFileSync(report, '');
    return;
  }
  const { java, problem } = toolJava(GOOGLE_JAVA_FORMAT);
  if (problem !== undefined) {
    writeFileSync(report, '');
    writeFileSync(skipped, `${problem}\n`);
    return;
  }
  const result = runJava({
    java,
    tool: 'google-java-format',
    classpath: tools.format,
    jvmArgs: JAVAC_EXPORTS,
    mainClass: 'com.google.googlejavaformat.java.Main',
    args: ['--dry-run', ...files],
    cwd: module.basedir,
  });
  writeFileSync(report, result.stdout);
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
    return { main: configs.checkstyle.project, test: configs.checkstyle.project, properties };
  }
  const jar = tools.checkstyle.find(
    (entry) => path.basename(entry) === `checkstyle-${pinned.checkstyle}.jar`,
  );
  const { main, test } = writeCheckstyleConfigs({ checkstyleJar: jar, directory });
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
