import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { runJava } from './maven-command.mjs';
import { failedCases, failingTestsError, freshReports } from '../builds/test-failures.mjs';

const DEFAULT_ARCHUNIT_INCLUDES = '**/*ArchTest.class,**/*ArchitectureTest.class';
const JUNIT_ENGINE_JAR = /^junit-platform-engine-.+\.jar$/u;
const TESTNG_JAR = /^testng-\d.*\.jar$/u;

export function archunitMatcher(includes = DEFAULT_ARCHUNIT_INCLUDES) {
  const patterns = includes
    .split(',')
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .map((pattern) => globMatcher(pattern));
  return (className) => {
    const file = `${className.replaceAll('.', '/').replace(/\$.*$/u, '')}.class`;
    return patterns.some((pattern) => pattern.test(file));
  };
}

function classFiles(directory) {
  return existsSync(directory)
    ? readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.class'))
        .map((entry) =>
          path.relative(directory, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
        )
    : [];
}

export function testReportDirectories(module) {
  const surefire = ['surefire', module.surefireReports];
  const shared = path.resolve(module.failsafeReports) === path.resolve(module.surefireReports);
  return shared ? [surefire] : [surefire, ['failsafe', module.failsafeReports]];
}

export function suiteNameOf(report) {
  return path.basename(report).replace(/^TEST-|\.xml$/gu, '');
}

export function collectTestResults({ module, reportDir, since, isArchunit }) {
  const reports = testReportDirectories(module).flatMap(([, directory]) =>
    freshReports(directory, since),
  );
  const archunitDir = path.join(reportDir, 'archunit');
  const failures = [];
  for (const report of reports) {
    if (isArchunit(suiteNameOf(report))) {
      mkdirSync(archunitDir, { recursive: true });
      copyFileSync(report, path.join(archunitDir, path.basename(report)));
    } else {
      failures.push(...failedCases(report));
    }
  }
  requireArchunitRun(module, reports, isArchunit);
  if (failures.length > 0) {
    throw failingTestsError(module.basedir, failures);
  }
  return reports.length > 0;
}

function requireArchunitRun(module, reports, isArchunit) {
  const archunitClasses = topLevelClasses(module.testOutputDirectory).filter(isArchunit);
  if (archunitClasses.length > 0 && !reports.some((report) => isArchunit(suiteNameOf(report)))) {
    throw new Error(
      `Neither maven-surefire-plugin nor maven-failsafe-plugin ran any of the ArchUnit classes in ${module.basedir} ` +
        `(${archunitClasses.join(', ')}). Let surefire run them (its <includes>, no skipTests) ` +
        'so nitpicker can read their results',
    );
  }
}

export function freshExecFiles(execFiles, since) {
  return [...new Set(execFiles)].filter(
    (file) => existsSync(file) && statSync(file).mtimeMs >= since,
  );
}

export function runJacocoReport({ module, reportDir, tools, execFiles, since, testsRan, spawn }) {
  const report = path.join(reportDir, 'jacoco.xml');
  if (classFiles(module.outputDirectory).length === 0) {
    writeFileSync(report, `<?xml version="1.0"?><report name="${module.coordinates}"></report>`);
    return;
  }
  const fresh = freshExecFiles(execFiles, since);
  if (fresh.length === 0 && testsRan) {
    throw new Error(
      `JaCoCo recorded no coverage in ${module.basedir}: the tests ran without its agent. If maven-surefire-plugin sets <argLine>, start it with @{argLine} so the agent stays attached`,
    );
  }
  runJava({
    tool: 'JaCoCo',
    classpath: tools.jacoco,
    mainClass: 'org.jacoco.cli.internal.Main',
    args: [
      'report',
      ...fresh,
      '--classfiles',
      module.outputDirectory,
      ...module.sourceRoots
        .filter((root) => existsSync(root))
        .flatMap((root) => ['--sourcefiles', root]),
      '--xml',
      report,
      '--quiet',
    ],
    cwd: module.basedir,
    accept: (result) => result.status === 0,
    spawn,
  });
}

export function pitTargets(classDirectory) {
  const targets = new Set();
  const pending = [{ directory: classDirectory, prefix: '' }];
  for (const { directory, prefix } of pending) {
    const entries = readdirSync(directory, { withFileTypes: true });
    const classes = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.class'))
      .map((entry) => `${prefix}${entry.name.replace(/\.class$/u, '')}`);
    const wholePackage = classes.length > 0 && !'org.pitest.'.startsWith(prefix);
    if (wholePackage) {
      targets.add(`${prefix}*`);
      continue;
    }
    for (const name of classes) {
      targets.add(name);
    }
    pending.push(
      ...entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          directory: path.join(directory, entry.name),
          prefix: `${prefix}${entry.name}.`,
        })),
    );
  }
  return [...targets].sort();
}

function topLevelClasses(classDirectory) {
  return [
    ...new Set(
      classFiles(classDirectory).map((file) =>
        file
          .replace(/\.class$/u, '')
          .replaceAll('/', '.')
          .replace(/\$.*$/u, ''),
      ),
    ),
  ];
}

export function pitTests(testClassDirectory, isArchunit) {
  return topLevelClasses(testClassDirectory).filter((name) => !isArchunit(name));
}

export function junitLauncherVersion(classpath) {
  const names = classpath.map((entry) => path.basename(entry));
  const engine = names.find((name) => JUNIT_ENGINE_JAR.test(name));
  return engine === undefined || names.some((name) => name.startsWith('junit-platform-launcher-'))
    ? undefined
    : engine.replace(/^junit-platform-engine-|\.jar$/gu, '');
}

export function pitClasspath(tools, testRuntime) {
  const names = testRuntime.map((entry) => path.basename(entry));
  const launcher = junitLauncherVersion(testRuntime);
  return [
    ...tools.pit,
    ...(names.some((name) => JUNIT_ENGINE_JAR.test(name)) ? tools['pit-junit5'] : []),
    ...(launcher === undefined ? [] : tools[`launcher-${launcher}`]),
    ...(names.some((name) => TESTNG_JAR.test(name)) ? tools['pit-testng'] : []),
  ];
}

export function runPit({ module, reportDir, tools, classpaths, isArchunit, spawn }) {
  const pitDir = path.join(reportDir, 'pit');
  rmSync(pitDir, { recursive: true, force: true });
  mkdirSync(pitDir, { recursive: true });
  const report = path.join(pitDir, 'mutations.xml');
  if (classFiles(module.outputDirectory).length === 0) {
    return;
  }
  runJava({
    tool: 'PIT',
    classpath: pitClasspath(tools, classpaths.testRuntime),
    mainClass: 'org.pitest.mutationtest.commandline.MutationCoverageReport',
    args: [
      '--reportDir',
      pitDir,
      '--targetClasses',
      pitTargets(module.outputDirectory).join(','),
      '--targetTests',
      pitTests(module.testOutputDirectory, isArchunit).join(','),
      '--sourceDirs',
      module.sourceRoots.filter((root) => existsSync(root)).join(','),
      '--classPath',
      [...new Set(classpaths.testRuntime)].filter((entry) => existsSync(entry)).join(','),
      '--mutableCodePaths',
      module.outputDirectory,
      '--outputFormats',
      'XML',
      '--timestampedReports',
      'false',
      '--threads',
      '2',
      '--failWhenNoMutations',
      'false',
      '--verbose',
      'false',
    ],
    cwd: module.basedir,
    accept: (result) => result.status === 0,
    spawn,
  });
  if (!existsSync(report)) {
    writeFileSync(report, '<mutations/>');
  }
}

export function missingLauncherVersions(analyzed) {
  const versions = analyzed.map(({ classpaths }) => junitLauncherVersion(classpaths.testRuntime));
  return [...new Set(versions.filter((version) => version !== undefined))];
}
