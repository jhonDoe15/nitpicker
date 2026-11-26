import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  nitpickerCheckstyleConfig,
  reportingCheckstyleConfig,
  suppressionsFile,
  withGuardChecks,
} from '../../builds/rulesets/checkstyle-config.mts';
import { removeQuietly } from '../../builds/cleanup/remove-quietly.mts';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mts';
import { layerCheckstyle } from '../../adapters/tool-config/checkstyle/checkstyle-layers.mts';
import { unformattedCheckstyle } from '../../adapters/tool-config/checkstyle/unformatted-checks.mts';
import { CHECKSTYLE_SKIPPED } from '../../adapters/reporting/skips/skipped-tools.mts';
import type { JavaEnvironment, JavaSpawn } from '../../adapters/typed/java-values.mts';
import { fieldOf, fieldsOf, optionalText, textOf } from '../../../../shared/values/readers.mts';
import { skipWithoutJdk, toolJava } from '../errorprone/maven-jdk.mts';
import type { SourceModule } from '../compile-sets/compiler-types.mts';
import { javaCommand, runJava } from '../programs/java-command.mts';
import type { ToolClasspaths } from '../typed/kotlin-types.mts';
import { javaFiles } from './java-files.mts';
import { handWrittenRoots } from '../generated/generated-roots.mts';
import { checkstyleOnEngine } from '../../builds/checkstyle/checkstyle-engine.mts';
import { mergeReports } from '../../builds/checkstyle/checkstyle-xml.mts';

type CheckstylePinned = { readonly checkstyle: string };
type CheckstyleSetup = {
  readonly config: string;
  readonly properties: string;
  readonly bundled?: string;
  readonly guards?: readonly string[];
};
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
const TOOL = 'Checkstyle';
const CHECKSTYLE = 'checkstyle';
const CHECKSTYLE_XML = 'checkstyle.xml';
const GOOGLE_CHECKS = 'google_checks.xml';

function bundledGoogleChecks(checkstyleJar: string | undefined, spawn: JavaSpawn): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-checkstyle-'));
  try {
    const result = spawn(javaCommand('jar'), ['xf', checkstyleJar ?? '', GOOGLE_CHECKS], {
      cwd: directory,
      encoding: 'utf8',
    });
    const file = path.join(directory, GOOGLE_CHECKS);
    if (result.status !== 0 || !existsSync(file)) {
      throw new Error(
        `could not read ${GOOGLE_CHECKS} from ${String(checkstyleJar)}: ${result.stderr}`,
      );
    }
    return readFileSync(file, 'utf8');
  } finally {
    removeQuietly(directory);
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
  const google = bundledGoogleChecks(jar, spawn ?? spawnSync);
  const bundled = textOf(nitpickerCheckstyleConfig(google));
  const unformatted = fieldOf(style, 'javaStyle') === 'none';
  const formatting = unformatted ? 'unformatted' : 'formatted';
  const declared = fieldsOf(fieldOf(configs, CHECKSTYLE));
  const directory = path.join(reportDir, test ? 'checkstyle-test-config' : 'checkstyle-config');
  const guards = ['checkstyle-all.xml', ...(test ? [] : ['checkstyle-main.xml'])];
  const setup = writeCheckstyleSetup({
    directory,
    nitpickerConfig: textOf(
      withGuardChecks(
        reportingCheckstyleConfig(
          unformatted ? unformattedCheckstyle(bundled, fieldOf(style, 'indentation')) : bundled,
          formatting,
        ),
        guards,
      ),
    ),
    suppressions: suppressionsFile(formatting),
    project: optionalText(declared['project']),
    projectWins: declared['projectWins'] !== false,
  });
  const bundledFile = path.join(directory, GOOGLE_CHECKS);
  writeFileSync(bundledFile, google);
  return { ...setup, bundled: bundledFile, guards };
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
  const left = leftByEngine(options, files);
  if (left?.length === 0) {
    copyFileSync(engineReportOf(setup), report);
    return;
  }
  rmSync(report, { force: true });
  runJava({
    java: toolJava({ tool: TOOL, environment }),
    tool: TOOL,
    classpath: tools[CHECKSTYLE],
    mainClass: 'com.puppycrawl.tools.checkstyle.Main',
    args: [
      '-c',
      setup.config,
      '-p',
      setup.properties,
      '-f',
      'xml',
      '-o',
      report,
      ...(left ?? files),
    ],
    cwd: module.basedir,
    accept: () => existsSync(report),
    spawn,
    timeoutMs,
  });
  if (left !== undefined) {
    mergeReports(report, engineReportOf(setup));
  }
}

function engineReportOf(setup: CheckstyleSetup): string {
  return path.join(path.dirname(setup.config), 'checkstyle-engine.xml');
}

function leftByEngine(
  { module, setup, pinned, environment }: ReportRequest,
  files: readonly string[],
): string[] | undefined {
  if (setup.bundled === undefined || setup.guards === undefined) {
    return undefined;
  }
  const directory = path.dirname(setup.config);
  const list = path.join(directory, 'files.txt');
  const absolute = files.map((file) => path.resolve(module.basedir, file));
  writeFileSync(list, absolute.join('\n'));
  const left = checkstyleOnEngine(
    {
      config: setup.config,
      bundled: setup.bundled,
      guards: setup.guards,
      files: list,
      engineReport: engineReportOf(setup),
      left: path.join(directory, 'left.txt'),
      version: pinned.checkstyle,
    },
    environment,
    { log: process.stderr },
  );
  return left?.map((file) => files[absolute.indexOf(file)] ?? file);
}

function runCheckstyleReports(options: CheckstyleOptions): void {
  const { module, reportDir, tools, pinned, spawn, timeoutMs, environment } = options;
  const context = { module, tools, pinned, spawn, timeoutMs, environment };
  checkstyleReport({
    ...context,
    setup: checkstyleSetup(options, false),
    roots: handWrittenRoots(module, module.sourceRoots, options.configs),
    report: path.join(reportDir, CHECKSTYLE_XML),
    always: true,
  });
  checkstyleReport({
    ...context,
    setup: checkstyleSetup(options, true),
    roots: handWrittenRoots(module, module.testSourceRoots, options.configs),
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
