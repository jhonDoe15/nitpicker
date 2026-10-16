import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { javaCommand } from '../maven-command.mjs';

const ERROR_PRONE_JDK = 21;
const VERSION = /version "(?:1\.)?(\d+)/u;
const VERSIONED_HOME = /^JAVA_HOME_\d+_(?:X64|ARM64|AARCH64)$/u;
const JDK_HOME = /<jdkHome>\s*([^<]+?)\s*<\/jdkHome>/gu;
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
    ? [...readFileSync(toolchains, 'utf8').matchAll(JDK_HOME)].map(([, jdkHome]) => jdkHome)
    : [];
  const installed = [path.join(home, '.sdkman', 'candidates', 'java'), ...systemJdks]
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

function describe(java) {
  const result = spawnSync(java, ['-version'], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') {
    return { java, missing: true };
  }
  return { java, feature: featureVersion(`${result.stderr}${result.stdout}`) };
}

export function errorProneJava({ preview }) {
  const project = describe(javaCommand('java'));
  if (project.missing) {
    throw new Error(
      `java not found (${project.java}): set JAVA_HOME to a JDK, or put its bin directory on the PATH`,
    );
  }
  if (project.feature === undefined) {
    throw new Error(`nitpicker could not read the version of ${project.java} (java -version)`);
  }
  const installed = jdkHomes().map((jdk) => describe(path.join(jdk, 'bin', 'java')));
  const { java, problem } = chooseErrorProneJdk({ project, preview, installed });
  if (problem !== undefined) {
    throw new Error(problem);
  }
  return java;
}
