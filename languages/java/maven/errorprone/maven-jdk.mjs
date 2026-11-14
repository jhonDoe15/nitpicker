import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { javaCommand } from '../maven-command.mjs';
import { explainedError } from '../../../../shared/messages/troubleshooting.mjs';

const ERROR_PRONE_JDK = 21;
const NEWEST_FORMATTER_JDK = 25;
const VERSION = /version "(?:1\.)?(\d+)/u;
const VERSIONED_HOME = /^JAVA_HOME_\d+_(?:X64|ARM64|AARCH64)$/u;
const JDK_HOME = /<jdkHome>([^<]*)<\/jdkHome>/gu;
const SYSTEM_JDKS = ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines'];

export function featureVersion(versionOutput) {
  const match = VERSION.exec(versionOutput);
  return match === null ? undefined : Number(match[1]);
}

function subdirectories(directory) {
  return existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => path.join(directory, entry.name))
    : [];
}

export function jdkHomes({ env = process.env, home = homedir(), systemJdks = SYSTEM_JDKS } = {}) {
  const toolchains = path.join(home, '.m2', 'toolchains.xml');
  const declared = existsSync(toolchains)
    ? [...readFileSync(toolchains, 'utf8').matchAll(JDK_HOME)]
        .map(([, jdkHome]) => jdkHome.trim())
        .filter((jdkHome) => jdkHome !== '')
    : [];
  const installed = [
    path.join(home, '.sdkman', 'candidates', 'java'),
    path.join(home, '.gradle', 'jdks'),
    ...systemJdks,
  ]
    .flatMap((directory) => subdirectories(directory))
    .flatMap((directory) => [directory, path.join(directory, 'Contents', 'Home')]);
  const variables = Object.keys(env)
    .filter((name) => VERSIONED_HOME.test(name))
    .sort()
    .map((name) => env[name]);
  return [...new Set([...variables, ...declared, ...installed])].filter((jdk) =>
    existsSync(path.join(jdk, 'bin', 'java')),
  );
}

export function chooseErrorProneJdk({ project, preview, installed }) {
  const wanted = preview ? project.feature : Math.max(ERROR_PRONE_JDK, project.feature);
  if (wanted < ERROR_PRONE_JDK) {
    return {
      problem:
        `Error Prone needs JDK ${ERROR_PRONE_JDK} or newer, and this project compiles with ` +
        `--enable-preview on JDK ${String(wanted)} (${project.java}), whose preview features only ` +
        `that JDK compiles. Move the build to JDK ${ERROR_PRONE_JDK} or newer, or drop --enable-preview`,
    };
  }
  if (project.feature === wanted || (!preview && project.feature > wanted)) {
    return { java: project.java };
  }
  const sorted = installed
    .filter((jdk) => jdk.feature !== undefined)
    .toSorted((left, right) => left.feature - right.feature);
  const found =
    sorted.find((jdk) => jdk.feature === wanted) ??
    (preview ? undefined : sorted.find((jdk) => jdk.feature > wanted));
  return found === undefined
    ? {
        problem:
          `Error Prone needs ${preview ? 'exactly' : 'at least'} JDK ${String(wanted)} ` +
          `(JDK ${ERROR_PRONE_JDK} or newer, and at least the project's own JDK), and ${project.java} is ` +
          `JDK ${String(project.feature)}. nitpicker found no such JDK in JAVA_HOME, the JAVA_HOME_<N>_X64 ` +
          'variables, ~/.m2/toolchains.xml, SDKMAN, /usr/lib/jvm or /Library/Java/JavaVirtualMachines. ' +
          'Install one there; the project keeps compiling for its own release',
      }
    : { java: found.java };
}

function describe(java, spawn) {
  const result = spawn(java, ['-version'], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') {
    return { java, missing: true };
  }
  return { java, feature: featureVersion(`${result.stderr}${result.stdout}`) };
}

function projectJava(spawn) {
  const project = describe(javaCommand('java'), spawn);
  if (project.missing) {
    throw explainedError(
      `java not found (${project.java}): set JAVA_HOME to a JDK, or put its bin directory on the PATH`,
    );
  }
  if (project.feature === undefined) {
    throw new Error(`nitpicker could not read the version of ${project.java} (java -version)`);
  }
  return project;
}

const LEVEL = /^(?:1\.)?(\d+)$/u;

export function sourceLevel(compiler = {}) {
  const levels = [compiler.release, compiler.source, compiler.test?.release, compiler.test?.source]
    .map((value) => LEVEL.exec(String(value ?? '').trim())?.[1])
    .filter((value) => value !== undefined)
    .map(Number);
  return levels.length === 0 ? undefined : Math.max(...levels);
}

function lowestFrom(installed, minimum) {
  return installed
    .filter((jdk) => jdk.feature !== undefined && jdk.feature >= minimum)
    .reduce(
      (best, jdk) => (best === undefined || jdk.feature < best.feature ? jdk : best),
      undefined,
    );
}

export function chooseToolJdk({ tool, project, installed, minimum = ERROR_PRONE_JDK }) {
  if (project.feature >= minimum) {
    return { java: project.java };
  }
  const found = lowestFrom(installed, minimum);
  return found === undefined
    ? {
        problem:
          `${tool} needs JDK ${String(minimum)} or newer to run, and ${project.java} is JDK ` +
          `${String(project.feature)}. nitpicker found no JDK ${String(minimum)} or newer in ` +
          'JAVA_HOME, the JAVA_HOME_<N>_X64 variables, ~/.m2/toolchains.xml, SDKMAN, /usr/lib/jvm or ' +
          '/Library/Java/JavaVirtualMachines. Install one there; the project keeps compiling for its ' +
          'own release',
      }
    : { java: found.java };
}

function installedBelow(project, minimum, spawn) {
  return project.feature >= minimum
    ? []
    : jdkHomes().map((jdk) => describe(path.join(jdk, 'bin', 'java'), spawn));
}

export function minimumJava({ tool, minimum, spawn = spawnSync }) {
  const project = projectJava(spawn);
  const installed = installedBelow(project, minimum, spawn);
  return chooseToolJdk({ tool, project, installed, minimum });
}

export function toolJava({ tool, level, spawn = spawnSync }) {
  const minimum = Math.max(ERROR_PRONE_JDK, level ?? 0);
  const project = projectJava(spawn);
  const installed = installedBelow(project, minimum, spawn);
  const { java, problem } = chooseToolJdk({ tool, project, installed, minimum });
  if (problem !== undefined) {
    throw explainedError(problem);
  }
  return java;
}

export function parserJava({ level, spawn = spawnSync }) {
  if (level === undefined) {
    return { java: javaCommand('java') };
  }
  const project = projectJava(spawn);
  const found = lowestFrom(installedBelow(project, level, spawn), level) ?? project;
  return { feature: found.feature, java: found.java };
}

export function chooseFormatterJdk({ tool, project, installed }) {
  const newest = installed
    .filter(
      (jdk) =>
        jdk.feature !== undefined &&
        jdk.feature >= ERROR_PRONE_JDK &&
        jdk.feature <= NEWEST_FORMATTER_JDK,
    )
    .reduce(
      (best, jdk) => (best === undefined || jdk.feature > best.feature ? jdk : best),
      undefined,
    );
  if (project.feature >= ERROR_PRONE_JDK && !(newest?.feature > project.feature)) {
    return { java: project.java };
  }
  return newest === undefined ? chooseToolJdk({ tool, project, installed }) : { java: newest.java };
}

export function formatterJava({ tool, spawn = spawnSync }) {
  const project = projectJava(spawn);
  const installed = jdkHomes().map((jdk) => describe(path.join(jdk, 'bin', 'java'), spawn));
  const { java, problem } = chooseFormatterJdk({ tool, project, installed });
  if (problem !== undefined) {
    throw explainedError(problem);
  }
  return java;
}

export function errorProneJava({ preview, spawn = spawnSync }) {
  const project = projectJava(spawn);
  const installed = jdkHomes().map((jdk) => describe(path.join(jdk, 'bin', 'java'), spawn));
  const { java, problem } = chooseErrorProneJdk({ project, preview, installed });
  if (problem !== undefined) {
    throw explainedError(problem);
  }
  return java;
}
