import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { readPinnedTools } from '../../builds/java-build.mjs';
import { runMaven } from '../../maven/maven-command.mjs';
import { moduleClasspaths, parseDependencyList, readReactor } from '../../maven/maven-project.mjs';
import { jacocoPlugin, MAVEN_PLUGINS, resolveTools } from '../../maven/maven-tools.mjs';
import {
  archunitMatcher,
  collectTestResults,
  junitLauncherVersion,
  runJacocoReport,
  runPit,
} from '../../maven/maven-tests.mjs';
import { copyTestResults } from '../../maven/results/maven-test-results.mjs';
import { ingestArchunit } from '../../ingest/archunit.mjs';
import { ingestJacoco } from '../../ingest/coverage-reports/jacoco.mjs';
import { ingestPit } from '../../ingest/pit.mjs';
import { sourceFileOf, sourceLocator } from '../reporting/kotlin-reports.mjs';
import { readSlowTestFindings } from '../test-times/slow-tests.mjs';

const CLOCK_SLACK_MS = 2000;

function readReport(directory, name) {
  const base = path.resolve(directory);
  const file = path.resolve(base, name);
  if (!file.startsWith(`${base}${path.sep}`)) {
    throw new Error(`Framework report escapes its directory: ${name}`);
  }
  return readFileSync(file, 'utf8');
}

function buildFixture(projectRoot, { maven, reportDir, pinned }) {
  runMaven({
    projectRoot,
    maven,
    args: [
      '--quiet',
      `${MAVEN_PLUGINS.help}:effective-pom`,
      `-Doutput=${path.join(reportDir, 'effective-pom.xml')}`,
      `${jacocoPlugin(pinned)}:prepare-agent`,
      `-Djacoco.destFile=${path.join(reportDir, 'jacoco.exec')}`,
      'test',
      '-Dmaven.test.failure.ignore=true',
      `${MAVEN_PLUGINS.dependency}:list`,
      `-DoutputFile=${path.join(reportDir, 'dependencies.txt')}`,
      '-DoutputAbsoluteArtifactFilename=true',
    ],
  });
  const [module] = readReactor(
    projectRoot,
    readFileSync(path.join(reportDir, 'effective-pom.xml'), 'utf8'),
  );
  const dependencies = parseDependencyList(
    readFileSync(path.join(reportDir, 'dependencies.txt'), 'utf8'),
  );
  return { module, classpaths: moduleClasspaths(module, dependencies) };
}

function measureFixture(context) {
  const { module, classpaths, reportDir, pinned, maven, since } = context;
  const launcher = junitLauncherVersion(classpaths.testRuntime);
  const tools = resolveTools({
    projectRoot: module.basedir,
    maven,
    pinned,
    launcherVersions: launcher === undefined ? [] : [launcher],
  });
  const isArchunit = archunitMatcher(module.archunitIncludes);
  const testsRan = collectTestResults({ module, reportDir, since, isArchunit });
  copyTestResults({ module, reportDir, since, isArchunit });
  runJacocoReport({
    module,
    reportDir,
    tools,
    execFiles: [path.join(reportDir, 'jacoco.exec')],
    since,
    testsRan,
  });
  runPit({ module, reportDir, tools, classpaths, isArchunit });
}

function fixtureFindings({ module, reportDir, policy }) {
  const projectRoot = module.basedir;
  const relativeRoots = (roots) => roots.map((root) => path.relative(projectRoot, root));
  const sourceRoots = relativeRoots(module.sourceRoots);
  const testRoots = relativeRoots(module.testSourceRoots);
  const locate = sourceLocator(projectRoot, [...sourceRoots, ...testRoots]);
  const resolvePath = (className, fileName) => sourceFileOf(locate, className, fileName);
  const jacoco = readFileSync(path.join(reportDir, 'jacoco.xml'), 'utf8');
  const archunitDir = path.join(reportDir, 'archunit');
  return [
    ...sourceRoots.flatMap((sourceRoot) => ingestJacoco(jacoco, { sourceRoot }).findings),
    ...ingestPit(readFileSync(path.join(reportDir, 'pit/mutations.xml'), 'utf8'), { resolvePath })
      .findings,
    ...readdirSync(archunitDir).flatMap(
      (file) => ingestArchunit(readReport(archunitDir, file), { resolvePath }).findings,
    ),
    ...readSlowTestFindings({
      reportRoot: reportDir,
      projectRoot,
      testRoots,
      limits: policy.testSeconds,
    }),
  ];
}

export function mavenFrameworkFindings(projectRoot, { maven, policy }) {
  const reportDir = path.join(projectRoot, 'target/framework-reports');
  mkdirSync(reportDir, { recursive: true });
  const pinned = readPinnedTools();
  const since = Date.now() - CLOCK_SLACK_MS;
  const context = {
    ...buildFixture(projectRoot, { maven, reportDir, pinned }),
    reportDir,
    pinned,
    maven,
    since,
    policy,
  };
  measureFixture(context);
  return fixtureFindings(context);
}
