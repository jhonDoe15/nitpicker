import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { javaCommand, runJava } from '../../programs/java-command.mts';
import { detektJava, skipWithoutJdk } from '../../errorprone/maven-jdk.mts';
import { DETEKT_SKIPPED } from '../../../adapters/reporting/skips/skipped-tools.mjs';
import { EMPTY_SARIF, kotlinFiles, lintedRoots } from './kotlin-files.mts';
import { writeKotlinNotes } from '../../../adapters/reporting/kotlin-notes.mjs';
import { GRADLE_DIRECTORY } from '../../../builds/java-build.mjs';
import { toolchainJdkHome } from '../../configuration/toolchain/toolchain-jdk.mts';
import type { JdkRequirements, ToolchainContext } from '../../typed/toolchain-types.mts';
import { type JavaSpawn, callUntyped } from '../../../adapters/typed/java-values.mts';
import { fieldOf, numberOr, optionalText, textOf } from '../../../../../shared/values/readers.mts';
import type {
  KotlinClasspaths,
  KotlinModule,
  KotlinOptions,
  ToolClasspaths,
} from '../../typed/kotlin-types.mts';

type DetektArgumentOptions = {
  readonly detektLayers?: readonly string[] | undefined;
  readonly detektLists?: string | undefined;
};

const DETEKT_DIRECTORY = path.resolve(GRADLE_DIRECTORY, '../detekt');
const FINDINGS_EXIT_CODE = 2;
const STDLIB_JAR = /^kotlin-stdlib/u;
const JAVA_HOME_LINE = /java\.home = (.+)/u;

function runningJdkHome(spawn: JavaSpawn): string {
  const result = spawn(
    textOf(callUntyped(javaCommand, 'java')),
    ['-XshowSettings:properties', '-version'],
    {
      encoding: 'utf8',
    },
  );
  const found = JAVA_HOME_LINE.exec(`${result.stderr}${result.stdout}`)?.[1]?.trim();
  if (found === undefined) {
    throw new Error(
      'nitpicker could not find the JDK home that detekt resolves JDK types against: put a JDK on the PATH or set JAVA_HOME to it',
    );
  }
  return found;
}

export function jdkHome(
  { jdkToolchain }: { readonly jdkToolchain?: JdkRequirements | undefined },
  context?: ToolchainContext,
): { readonly home: string; readonly note?: string } {
  if (jdkToolchain === undefined) {
    return { home: runningJdkHome(context?.spawn ?? spawnSync) };
  }
  const home = optionalText(callUntyped(toolchainJdkHome, jdkToolchain, context ?? {}));
  if (home !== undefined) {
    return { home };
  }
  const fallback = runningJdkHome(context?.spawn ?? spawnSync);
  return {
    home: fallback,
    note: `The build selects the JDK toolchain ${JSON.stringify(jdkToolchain)}, which no toolchains file lists, so detekt resolves JDK types against ${fallback}`,
  };
}

export function detektClasspath({
  detektStdlib,
  javaClassDirectories,
  libraries,
  ownOutputs,
}: {
  readonly detektStdlib: readonly string[];
  readonly javaClassDirectories: readonly string[];
  readonly libraries: readonly string[];
  readonly ownOutputs: readonly string[];
}): string[] {
  return [
    ...new Set([
      ...detektStdlib,
      ...javaClassDirectories.filter((directory) => existsSync(directory)),
      ...libraries.filter(
        (entry) =>
          existsSync(entry) &&
          !ownOutputs.includes(entry) &&
          !STDLIB_JAR.test(path.basename(entry)),
      ),
    ]),
  ];
}

export function detektArguments({
  module,
  report,
  options,
  classpath,
  home,
}: {
  readonly module: Pick<KotlinModule, 'basedir' | 'kotlin'>;
  readonly report: string;
  readonly options: DetektArgumentOptions;
  readonly classpath: readonly string[];
  readonly home: string;
}): string[] {
  const configs = [
    ...(options.detektLayers ?? []),
    path.join(DETEKT_DIRECTORY, 'nitpicker-detekt.yml'),
    options.detektLists,
    path.join(DETEKT_DIRECTORY, 'detekt-validation.yml'),
  ].filter((config) => config !== undefined);
  return [
    ...['--input', lintedRoots(module.kotlin).join(',')],
    ...['--includes', '**/*.kt'],
    ...['--report', `sarif:${report}`],
    ...['--base-path', module.basedir],
    '--build-upon-default-config',
    ...['--config', configs.join(',')],
    ...['--classpath', classpath.join(path.delimiter)],
    ...['--jdk-home', home],
  ];
}

function detektFinished(result: unknown, report: string): boolean {
  const status = numberOr(fieldOf(result, 'status'), -1);
  return (status === 0 || status === FINDINGS_EXIT_CODE) && existsSync(report);
}

export function runDetekt({
  module,
  reportDir,
  tools,
  classpaths,
  javaClassDirectories,
  options,
}: {
  readonly module: KotlinModule;
  readonly reportDir: string;
  readonly tools: ToolClasspaths;
  readonly classpaths: KotlinClasspaths;
  readonly javaClassDirectories: readonly string[];
  readonly options: KotlinOptions;
}): void {
  const report = path.join(reportDir, 'detekt.sarif');
  if (kotlinFiles(lintedRoots(module.kotlin)).length === 0) {
    writeFileSync(report, EMPTY_SARIF);
    return;
  }
  const classpath = detektClasspath({
    detektStdlib: tools['detekt-stdlib'] ?? [],
    javaClassDirectories,
    libraries: [...classpaths.mainCompile, ...classpaths.testCompile],
    ownOutputs: [module.outputDirectory, module.testOutputDirectory],
  });
  const jdk = jdkHome(module.kotlin, options.toolchains);
  writeKotlinNotes(reportDir, jdk.note === undefined ? [] : [jdk.note]);
  callUntyped(
    skipWithoutJdk,
    { reportDir, file: DETEKT_SKIPPED, placeholders: { 'detekt.sarif': EMPTY_SARIF } },
    () => {
      callUntyped(runJava, {
        java: callUntyped(detektJava, {
          spawn: options.spawn,
          environment: options.toolchains.environment,
        }),
        tool: 'detekt',
        classpath: tools['detekt'],
        mainClass: 'io.gitlab.arturbosch.detekt.cli.Main',
        args: detektArguments({ module, report, options, classpath, home: jdk.home }),
        cwd: module.basedir,
        spawn: options.spawn,
        timeoutMs: options.timeoutMs,
        accept: (result: unknown) => detektFinished(result, report),
      });
    },
  );
}
