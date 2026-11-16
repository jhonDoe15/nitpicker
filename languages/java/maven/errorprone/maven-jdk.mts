import { spawnSync } from 'node:child_process';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';
import type { JavaEnvironment, JavaSpawn } from '../../adapters/typed/java-values.mts';
import { noFittingJdk } from './jdk-skip.mts';
import { javaCommand } from '../programs/java-command.mts';
import {
  type FeatureJdk,
  type Installed,
  type JdkChoice,
  type JdkProbe,
  featureJdks,
  installedJdks,
  projectJava,
} from './jdk-probe.mts';

export { isNoFittingJdk, noFittingJdk, skipWithoutJdk } from './jdk-skip.mts';

type ChooseRequest = {
  readonly tool: string;
  readonly project: FeatureJdk;
  readonly installed: readonly Installed[];
  readonly minimum?: number;
};
type ProbeOptions = {
  readonly spawn?: JavaSpawn | undefined;
  readonly environment: JavaEnvironment;
};

const ERROR_PRONE_JDK = 21;
const NEWEST_FORMATTER_JDK = 25;
const DETEKT_NEWEST_JDK = 21;
const DETEKT_OLDEST_JDK = 17;
const JAVA = 'java';
const SEARCHED =
  'JAVA_HOME, the JAVA_HOME_<N>_X64 variables, ~/.m2/toolchains.xml, SDKMAN, /usr/lib/jvm or ' +
  '/Library/Java/JavaVirtualMachines';

export function chooseErrorProneJdk({
  project,
  preview,
  installed,
}: {
  readonly project: FeatureJdk;
  readonly preview: boolean;
  readonly installed: readonly Installed[];
}): JdkChoice {
  const wanted = preview ? project.feature : Math.max(ERROR_PRONE_JDK, project.feature);
  if (wanted < ERROR_PRONE_JDK) {
    return {
      problem:
        `Error Prone needs JDK ${String(ERROR_PRONE_JDK)} or newer, and this project compiles with ` +
        `--enable-preview on JDK ${String(wanted)} (${project.java}), whose preview features only ` +
        `that JDK compiles. Move the build to JDK ${String(ERROR_PRONE_JDK)} or newer, or drop --enable-preview`,
    };
  }
  if (project.feature === wanted || (!preview && project.feature > wanted)) {
    return { java: project.java };
  }
  const sorted = featureJdks(installed).toSorted((left, right) => left.feature - right.feature);
  const found =
    sorted.find((jdk) => jdk.feature === wanted) ??
    (preview ? undefined : sorted.find((jdk) => jdk.feature > wanted));
  return found === undefined
    ? {
        problem:
          `Error Prone needs ${preview ? 'exactly' : 'at least'} JDK ${String(wanted)} ` +
          `(JDK ${String(ERROR_PRONE_JDK)} or newer, and at least the project's own JDK), and ${project.java} is ` +
          `JDK ${String(project.feature)}. nitpicker found no such JDK in ${SEARCHED}. ` +
          'Install one there; the project keeps compiling for its own release',
      }
    : { java: found.java };
}

const LEVEL = /^(?:1\.)?(\d+)$/u;

function levelText(value: unknown): string {
  return value === undefined || value === null ? '' : textOf(value);
}

export function sourceLevel(compiler: unknown): number | undefined {
  const test = fieldOf(compiler, 'test');
  const levels = [
    fieldOf(compiler, 'release'),
    fieldOf(compiler, 'source'),
    fieldOf(test, 'release'),
    fieldOf(test, 'source'),
  ]
    .map((value) => LEVEL.exec(levelText(value).trim())?.[1])
    .filter((value) => value !== undefined)
    .map(Number);
  return levels.length === 0 ? undefined : Math.max(...levels);
}

function lowestFrom(installed: readonly Installed[], minimum: number): FeatureJdk | undefined {
  return featureJdks(installed)
    .filter((jdk) => jdk.feature >= minimum)
    .reduce<FeatureJdk | undefined>(
      (best, jdk) => (best === undefined || jdk.feature < best.feature ? jdk : best),
      undefined,
    );
}

function newestWithin(
  installed: readonly Installed[],
  oldest: number,
  newest: number,
): FeatureJdk | undefined {
  return featureJdks(installed)
    .filter((jdk) => jdk.feature >= oldest && jdk.feature <= newest)
    .reduce<FeatureJdk | undefined>(
      (best, jdk) => (best === undefined || jdk.feature > best.feature ? jdk : best),
      undefined,
    );
}

export function chooseToolJdk({
  tool,
  project,
  installed,
  minimum = ERROR_PRONE_JDK,
}: ChooseRequest): JdkChoice {
  if (project.feature >= minimum) {
    return { java: project.java };
  }
  const found = lowestFrom(installed, minimum);
  return found === undefined
    ? {
        problem:
          `${tool} needs JDK ${String(minimum)} or newer to run, and ${project.java} is JDK ` +
          `${String(project.feature)}. nitpicker found no JDK ${String(minimum)} or newer in ` +
          `${SEARCHED}. Install one there; the project keeps compiling for its own release`,
      }
    : { java: found.java };
}

function installedBelow(project: FeatureJdk, minimum: number, probe: JdkProbe): Installed[] {
  return project.feature >= minimum ? [] : installedJdks(probe);
}

export function minimumJava({
  tool,
  minimum,
  spawn = spawnSync,
  environment,
}: {
  readonly tool: string;
  readonly minimum: number;
  readonly spawn?: JavaSpawn | undefined;
  readonly environment: JavaEnvironment;
}): JdkChoice {
  const project = projectJava(spawn);
  const installed = installedBelow(project, minimum, { spawn, environment });
  return chooseToolJdk({ tool, project, installed, minimum });
}

function chosenJava(
  { spawn = spawnSync, environment }: ProbeOptions,
  choose: (project: FeatureJdk, probe: JdkProbe) => JdkChoice,
): string {
  const { java, problem } = choose(projectJava(spawn), { spawn, environment });
  if (problem !== undefined) {
    throw noFittingJdk(problem);
  }
  return java;
}

export function toolJava({
  tool,
  level,
  ...probe
}: ProbeOptions & { readonly tool: string; readonly level?: number | undefined }): string {
  const minimum = Math.max(ERROR_PRONE_JDK, level ?? 0);
  return chosenJava(probe, (project, found) =>
    chooseToolJdk({ tool, project, installed: installedBelow(project, minimum, found), minimum }),
  );
}

export function parserJava({
  level,
  spawn = spawnSync,
  environment,
}: {
  readonly level: number | undefined;
  readonly spawn?: JavaSpawn | undefined;
  readonly environment: JavaEnvironment;
}): { readonly java: string; readonly feature?: number } {
  if (level === undefined) {
    return { java: javaCommand(JAVA) };
  }
  const project = projectJava(spawn);
  const found =
    lowestFrom(installedBelow(project, level, { spawn, environment }), level) ?? project;
  return { feature: found.feature, java: found.java };
}

export function structureJava({
  level,
  spawn = spawnSync,
  environment,
}: {
  readonly level: number | undefined;
  readonly spawn?: JavaSpawn | undefined;
  readonly environment: JavaEnvironment;
}): { readonly java: string; readonly feature?: number } {
  const found = parserJava({ level, spawn, environment });
  if (level !== undefined && found.feature !== undefined && found.feature < level) {
    throw noFittingJdk(
      `its sources are Java ${String(level)}, and the structure metrics parse them with the javac of the ` +
        `JVM they run on, which is JDK ${String(found.feature)} (${found.java}). nitpicker found no JDK ` +
        `${String(level)} or newer in ${SEARCHED}. Install one there`,
    );
  }
  return found;
}

export function chooseFormatterJdk({
  tool,
  project,
  installed,
}: Omit<ChooseRequest, 'minimum'>): JdkChoice {
  const newest = newestWithin(installed, ERROR_PRONE_JDK, NEWEST_FORMATTER_JDK);
  if (
    project.feature >= ERROR_PRONE_JDK &&
    !(newest !== undefined && newest.feature > project.feature)
  ) {
    return { java: project.java };
  }
  return newest === undefined ? chooseToolJdk({ tool, project, installed }) : { java: newest.java };
}

export function formatterJava({
  tool,
  ...probe
}: ProbeOptions & { readonly tool: string }): string {
  return chosenJava(probe, (project, found) =>
    chooseFormatterJdk({ tool, project, installed: installedJdks(found) }),
  );
}

export function chooseDetektJdk({
  project,
  installed,
}: Pick<ChooseRequest, 'project' | 'installed'>): JdkChoice {
  if (project.feature <= DETEKT_NEWEST_JDK) {
    return { java: project.java };
  }
  const found = newestWithin(installed, DETEKT_OLDEST_JDK, DETEKT_NEWEST_JDK);
  return found === undefined
    ? {
        problem:
          `detekt runs on JDK ${String(DETEKT_OLDEST_JDK)} to ${String(DETEKT_NEWEST_JDK)} only, and ` +
          `Maven runs on JDK ${String(project.feature)} (${project.java}). nitpicker found no such JDK in ` +
          `${SEARCHED}. Install one there; detekt still resolves JDK types ` +
          "against the project's own JDK",
      }
    : { java: found.java };
}

export function detektJava(probe: ProbeOptions): string {
  return chosenJava(probe, (project, found) =>
    chooseDetektJdk({
      project,
      installed: project.feature <= DETEKT_NEWEST_JDK ? [] : installedJdks(found),
    }),
  );
}

export function errorProneJava({
  preview,
  ...probe
}: ProbeOptions & { readonly preview: boolean }): string {
  return chosenJava(probe, (project, found) =>
    chooseErrorProneJdk({ project, preview, installed: installedJdks(found) }),
  );
}
