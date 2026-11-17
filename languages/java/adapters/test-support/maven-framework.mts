import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { readPinnedTools } from '../../builds/java-build.mjs';
import { runMaven, TEST_RERUNS_OFF } from '../../maven/maven-command.mjs';
import { type ReactorModule, lifecycleArgs, readReactor } from '../../maven/maven-project.mts';
import {
  moduleClasspaths,
  parseDependencyList,
} from '../../maven/configuration/maven-classpaths.mts';
import { jacocoPlugin, MAVEN_PLUGINS, resolveTools } from '../../maven/maven-tools.mjs';
import {
  archunitMatcher,
  collectTestResults,
  junitLauncherVersion,
  runJacocoReport,
} from '../../maven/maven-tests.mts';
import { runPit } from '../../maven/pit/maven-pit.mts';
import { copyTestResults } from '../../maven/results/maven-test-results.mts';
import { ingestArchunit } from '../../ingest/archunit.mts';
import { ingestJacoco } from '../../ingest/coverage-reports/jacoco.mts';
import { ingestPit } from '../../ingest/pit.mts';
import { sourceFileOf, sourceLocator } from '../reporting/kotlin-reports.mjs';
import type { ToolClasspaths } from '../../maven/typed/kotlin-types.mts';
import { findingsOf, type JavaFinding, type JavaPolicy } from '../typed/java-values.mts';
import { optionalText } from '../../../../shared/values/readers.mts';
import { readSlowTestFindings } from '../test-times/slow-tests.mts';

type PinnedTools = object;
type FixtureModule = ReactorModule;
type Fixture = {
  readonly module: FixtureModule;
  readonly classpaths: { readonly testRuntime: readonly unknown[] };
};
type FixtureContext = Fixture & {
  readonly reportDir: string;
  readonly pinned: PinnedTools;
  readonly maven: string;
  readonly since: number;
  readonly policy: JavaPolicy;
  readonly mutations: boolean;
};

const pinnedTools: () => PinnedTools = readPinnedTools;
const reactorOf = readReactor;
const dependenciesOf = parseDependencyList;
const classpathsOf = moduleClasspaths;
const lifecycleOf = lifecycleArgs;
const jacocoPluginOf: (pinned: PinnedTools, modules: FixtureModule[]) => string = jacocoPlugin;
const toolsFor: (request: {
  readonly projectRoot: string;
  readonly maven: string;
  readonly pinned: PinnedTools;
  readonly launcherVersions: string[];
  readonly extraTools: undefined;
  readonly spawn: undefined;
  readonly timeoutMs: undefined;
}) => ToolClasspaths = resolveTools;

const CLOCK_SLACK_MS = 2000;

function readReport(directory: string, name: string): string {
  const base = path.resolve(directory);
  const file = path.resolve(base, name);
  if (!file.startsWith(`${base}${path.sep}`)) {
    throw new Error(`Framework report escapes its directory: ${name}`);
  }
  return readFileSync(file, 'utf8');
}

function buildFixture(
  projectRoot: string,
  { maven, reportDir, pinned }: { maven: string; reportDir: string; pinned: PinnedTools },
): Fixture {
  const effectivePom = path.join(reportDir, 'effective-pom.xml');
  runMaven({
    projectRoot,
    maven,
    args: ['--quiet', `${MAVEN_PLUGINS.help}:effective-pom`, `-Doutput=${effectivePom}`],
  });
  const modules = reactorOf(projectRoot, readFileSync(effectivePom, 'utf8'));
  runMaven({
    projectRoot,
    maven,
    args: [
      '--quiet',
      `${jacocoPluginOf(pinned, modules)}:prepare-agent`,
      `-Djacoco.destFile=${path.join(reportDir, 'jacoco.exec')}`,
      ...lifecycleOf(modules),
      '-Dmaven.test.failure.ignore=true',
      ...TEST_RERUNS_OFF,
      `${MAVEN_PLUGINS.dependency}:list`,
      `-DoutputFile=${path.join(reportDir, 'dependencies.txt')}`,
      '-DoutputAbsoluteArtifactFilename=true',
    ],
  });
  const module = modules[0];
  if (module === undefined) {
    throw new Error('Maven reactor has no modules');
  }
  const dependencies = dependenciesOf(
    readFileSync(path.join(reportDir, 'dependencies.txt'), 'utf8'),
  );
  return { module, classpaths: classpathsOf(module, dependencies) };
}

function measureFixture(context: FixtureContext): void {
  const { module, classpaths, reportDir, pinned, maven, since, mutations } = context;
  const launcher = junitLauncherVersion(classpaths.testRuntime);
  const tools = toolsFor({
    projectRoot: module.basedir,
    maven,
    pinned,
    launcherVersions: !mutations || launcher === undefined ? [] : [launcher],
    extraTools: undefined,
    spawn: undefined,
    timeoutMs: undefined,
  });
  const isArchunit = archunitMatcher(module.archunitIncludes);
  const { testsRan } = collectTestResults({ module, reportDir, since, isArchunit });
  copyTestResults({ module, reportDir, since, isArchunit });
  runJacocoReport({
    module,
    reportDir,
    tools,
    execFiles: [path.join(reportDir, 'jacoco.exec'), ...module.jacocoDestFiles],
    since,
    testsRan,
  });
  if (mutations) {
    runPit({ module, reportDir, tools, classpaths, isArchunit });
  }
}

function fixtureFindings({ module, reportDir, policy, mutations }: FixtureContext): JavaFinding[] {
  const projectRoot = module.basedir;
  function relativeRoots(roots: readonly string[]) {
    return roots.map((root) => path.relative(projectRoot, root));
  }
  const sourceRoots = relativeRoots(module.sourceRoots);
  const testRoots = relativeRoots(module.testSourceRoots);
  const locate = sourceLocator(projectRoot, [...sourceRoots, ...testRoots]);
  function resolvePath(className: string, fileName: string | undefined): string | undefined {
    return optionalText(sourceFileOf(locate, className, fileName));
  }
  const jacoco = readFileSync(path.join(reportDir, 'jacoco.xml'), 'utf8');
  const archunitDir = path.join(reportDir, 'archunit');
  return findingsOf([
    ...sourceRoots.flatMap((sourceRoot) => ingestJacoco(jacoco, { sourceRoot }).findings),
    ...(mutations
      ? ingestPit(readFileSync(path.join(reportDir, 'pit/mutations.xml'), 'utf8'), { resolvePath })
          .findings
      : []),
    ...(existsSync(archunitDir) ? readdirSync(archunitDir) : []).flatMap(
      (file) => ingestArchunit(readReport(archunitDir, file), { resolvePath }).findings,
    ),
    ...readSlowTestFindings({
      reportRoot: reportDir,
      projectRoot,
      testRoots,
      limits: policy.testSeconds,
    }),
  ]);
}

export function mavenFrameworkFindings(
  projectRoot: string,
  {
    maven,
    policy = {},
    mutations = true,
    reportDir = path.join(projectRoot, 'target/framework-reports'),
  }: { maven: string; policy?: JavaPolicy; mutations?: true | false; reportDir?: string },
): JavaFinding[] {
  mkdirSync(reportDir, { recursive: true });
  const pinned = pinnedTools();
  const since = Date.now() - CLOCK_SLACK_MS;
  const context = {
    ...buildFixture(projectRoot, { maven, reportDir, pinned }),
    reportDir,
    pinned,
    maven,
    since,
    policy,
    mutations,
  };
  measureFixture(context);
  return fixtureFindings(context);
}
