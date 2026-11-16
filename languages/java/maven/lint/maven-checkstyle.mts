import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  nitpickerCheckstyleConfig,
  withGuardChecks,
} from '../../builds/rulesets/checkstyle-config.mjs';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { layerCheckstyle } from '../../adapters/tool-config/checkstyle/checkstyle-layers.mjs';
import { unformattedCheckstyle } from '../../adapters/tool-config/checkstyle/unformatted-checks.mjs';
import { CHECKSTYLE_SKIPPED } from '../../adapters/reporting/skips/skipped-tools.mjs';
import type { JavaEnvironment, JavaSpawn } from '../../adapters/typed/java-values.mts';
import { fieldOf, fieldsOf, optionalText, textOf } from '../../../../shared/values/readers.mts';
import { skipWithoutJdk, toolJava } from '../errorprone/maven-jdk.mts';
import type { SourceModule } from '../errorprone/compiler-types.mts';
import { javaCommand, runJava } from '../programs/java-command.mts';
import type { ToolClasspaths } from '../typed/kotlin-types.mts';
import { javaFiles } from './java-files.mts';

type CheckstylePinned = { readonly checkstyle: string };
type CheckstyleSetup = { readonly config: string; readonly properties: string };
type CheckstyleOptions = {
  readonly module: SourceModule;
  readonly reportDir: string;
  readonly tools: ToolClasspaths;
  readonly configs: unknown;
  readonly pinned: CheckstylePinned;
  readonly style: unknown;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: number | undefined;
  readonly environment: JavaEnvironment;
};
type SetupFiles = {
  readonly directory: string;
  readonly nitpickerConfig: string;
  readonly project?: string | undefined;
  readonly projectWins: boolean;
  readonly suppressions?: string;
};
type ReportRequest = Pick<
  CheckstyleOptions,
  'module' | 'tools' | 'spawn' | 'timeoutMs' | 'environment'
> & {
  readonly setup: CheckstyleSetup;
  readonly pinned: CheckstylePinned;
  readonly roots: readonly string[];
  readonly report: string;
  readonly always: boolean;
};

const LAYOUT_SUPPRESSIONS = 'checkstyle-suppressions.xml';
const UNFORMATTED_SUPPRESSIONS = 'checkstyle-suppressions-unformatted.xml';
const TOOL = 'Checkstyle';
const CHECKSTYLE = 'checkstyle';
const CHECKSTYLE_XML = 'checkstyle.xml';
const GOOGLE_CHECKS = 'google_checks.xml';

function bundledGoogleChecks(checkstyleJar: string, spawn: JavaSpawn): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-checkstyle-'));
  try {
    const result = spawn(javaCommand('jar'), ['xf', checkstyleJar, GOOGLE_CHECKS], {
      cwd: directory,
      encoding: 'utf8',
    });
    const file = path.join(directory, GOOGLE_CHECKS);
    if (result.status !== 0 || !existsSync(file)) {
      throw new Error(`could not read ${GOOGLE_CHECKS} from ${checkstyleJar}: ${result.stderr}`);
    }
    return readFileSync(file, 'utf8');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function propertiesLine(name: string, value: string): string {
  return `${name}=${value.replaceAll('\\', '\\\\')}`;
}

function checkstyleSetup(
  { reportDir, tools, configs, pinned, style, spawn }: CheckstyleOptions,
  test: boolean,
): CheckstyleSetup {
  const jar = (tools[CHECKSTYLE] ?? []).find(
    (entry) => path.basename(entry) === `checkstyle-${pinned.checkstyle}.jar`,
  );
  if (jar === undefined) {
    throw new Error(`checkstyle-${pinned.checkstyle}.jar is not among the Checkstyle tools`);
  }
  const bundled = textOf(nitpickerCheckstyleConfig(bundledGoogleChecks(jar, spawn ?? spawnSync)));
  const unformatted = fieldOf(style, 'javaStyle') === 'none';
  const declared = fieldsOf(fieldOf(configs, CHECKSTYLE));
  return writeCheckstyleSetup({
    directory: path.join(reportDir, test ? 'checkstyle-test-config' : 'checkstyle-config'),
    nitpickerConfig: textOf(
      withGuardChecks(
        unformatted ? unformattedCheckstyle(bundled, fieldOf(style, 'indentation')) : bundled,
        ['checkstyle-all.xml', ...(test ? [] : ['checkstyle-main.xml'])],
      ),
    ),
    suppressions: unformatted ? UNFORMATTED_SUPPRESSIONS : LAYOUT_SUPPRESSIONS,
    project: optionalText(declared['project']),
    projectWins: declared['projectWins'] !== false,
  });
}

export function writeCheckstyleSetup({
  directory,
  nitpickerConfig,
  project,
  projectWins,
  suppressions = LAYOUT_SUPPRESSIONS,
}: SetupFiles): CheckstyleSetup {
  mkdirSync(directory, { recursive: true });
  const config = path.join(directory, CHECKSTYLE_XML);
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

function emptyReport(pinned: CheckstylePinned): string {
  return `<checkstyle version="${pinned.checkstyle}"></checkstyle>`;
}

function checkstyleReport(options: ReportRequest): void {
  const { module, setup, tools, pinned, roots, report, always, spawn, timeoutMs, environment } =
    options;
  const files = javaFiles(roots);
  if (files.length === 0) {
    if (always) {
      writeFileSync(report, emptyReport(pinned));
    }
    return;
  }
  runJava({
    java: toolJava({ tool: TOOL, environment }),
    tool: TOOL,
    classpath: tools[CHECKSTYLE],
    mainClass: 'com.puppycrawl.tools.checkstyle.Main',
    args: ['-c', setup.config, '-p', setup.properties, '-f', 'xml', '-o', report, ...files],
    cwd: module.basedir,
    accept: () => existsSync(report),
    spawn,
    timeoutMs,
  });
}

function runCheckstyleReports(options: CheckstyleOptions): void {
  const { module, reportDir, tools, pinned, spawn, timeoutMs, environment } = options;
  const context = { module, tools, pinned, spawn, timeoutMs, environment };
  checkstyleReport({
    ...context,
    setup: checkstyleSetup(options, false),
    roots: module.sourceRoots,
    report: path.join(reportDir, CHECKSTYLE_XML),
    always: true,
  });
  checkstyleReport({
    ...context,
    setup: checkstyleSetup(options, true),
    roots: module.testSourceRoots,
    report: path.join(reportDir, 'checkstyle-test.xml'),
    always: false,
  });
}

export function runCheckstyle(options: CheckstyleOptions): void {
  const { reportDir, pinned } = options;
  skipWithoutJdk(
    {
      reportDir,
      file: CHECKSTYLE_SKIPPED,
      placeholders: { [CHECKSTYLE_XML]: emptyReport(pinned) },
    },
    () => {
      runCheckstyleReports(options);
    },
  );
}
