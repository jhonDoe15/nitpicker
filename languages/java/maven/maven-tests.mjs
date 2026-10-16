import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../../../shared/glob.mjs';
import { childrenNamed, parseXml } from '../ingest/common.mjs';
import { runJava } from './maven-command.mjs';

const DEFAULT_ARCHUNIT_INCLUDES = '**/*ArchTest.class,**/*ArchitectureTest.class';
const MAX_LISTED_FAILURES = 10;

export function archunitMatcher(includes = DEFAULT_ARCHUNIT_INCLUDES) {
  const patterns = includes
    .split(',')
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .map((pattern) => globToRegExp(pattern));
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

export function freshReports(directory, since) {
  return existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => /^TEST-.*\.xml$/u.test(name))
        .map((name) => path.join(directory, name))
        .filter((file) => statSync(file).mtimeMs >= since)
    : [];
}

export function suiteNameOf(report) {
  return path.basename(report).replace(/^TEST-|\.xml$/gu, '');
}

function failedCases(file) {
  const root = parseXml(readFileSync(file, 'utf8'));
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  return suites.flatMap((suite) =>
    childrenNamed(suite, 'testcase')
      .filter(
        (testCase) =>
          childrenNamed(testCase, 'failure').length + childrenNamed(testCase, 'error').length > 0,
      )
      .map((testCase) => {
        const problem = [
          ...childrenNamed(testCase, 'failure'),
          ...childrenNamed(testCase, 'error'),
        ][0];
        const message = (problem.attrs.message ?? problem.attrs.type ?? '').split('\n')[0];
        return `${testCase.attrs.classname ?? suite.attrs.name}.${testCase.attrs.name}: ${message}`;
      }),
  );
}

export function collectTestResults({ module, reportDir, since, isArchunit }) {
  const reports = freshReports(module.surefireReports, since);
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
    const listed = failures.slice(0, MAX_LISTED_FAILURES).map((failure) => `  ${failure}`);
    const more =
      failures.length > MAX_LISTED_FAILURES
        ? [`  and ${String(failures.length - MAX_LISTED_FAILURES)} more`]
        : [];
    throw new Error(
      [
        `Tests fail in ${module.basedir}; nitpicker needs a passing test suite for coverage and mutation testing:`,
        ...listed,
        ...more,
      ].join('\n'),
    );
  }
  return reports.length > 0;
}

function requireArchunitRun(module, reports, isArchunit) {
  const archunitClasses = topLevelClasses(module.testOutputDirectory).filter(isArchunit);
  if (archunitClasses.length > 0 && !reports.some((report) => isArchunit(suiteNameOf(report)))) {
    throw new Error(
      `maven-surefire-plugin ran none of the ArchUnit classes in ${module.basedir} (${archunitClasses.join(', ')}). Let surefire run them (its <includes>, no skipTests) so nitpicker can read their results`,
    );
  }
}

export function runJacocoReport({ module, reportDir, tools, execFile, since, testsRan }) {
  const report = path.join(reportDir, 'jacoco.xml');
  if (classFiles(module.outputDirectory).length === 0) {
    writeFileSync(report, `<?xml version="1.0"?><report name="${module.coordinates}"></report>`);
    return;
  }
  const fresh = existsSync(execFile) && statSync(execFile).mtimeMs >= since;
  if (!fresh && testsRan) {
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
      ...(fresh ? [execFile] : []),
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
  const engine = names.find((name) => /^junit-platform-engine-.+\.jar$/u.test(name));
  return engine === undefined || names.some((name) => name.startsWith('junit-platform-launcher-'))
    ? undefined
    : engine.replace(/^junit-platform-engine-|\.jar$/gu, '');
}

export function runPit({ module, reportDir, tools, classpaths, isArchunit }) {
  const pitDir = path.join(reportDir, 'pit');
  rmSync(pitDir, { recursive: true, force: true });
  mkdirSync(pitDir, { recursive: true });
  const report = path.join(pitDir, 'mutations.xml');
  if (classFiles(module.outputDirectory).length === 0) {
    return;
  }
  const launcher = junitLauncherVersion(classpaths.testRuntime);
  runJava({
    tool: 'PIT',
    classpath: [...tools.pit, ...(launcher === undefined ? [] : tools[`launcher-${launcher}`])],
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
  });
  if (!existsSync(report)) {
    writeFileSync(report, '<mutations/>');
  }
}
