import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { explainedError } from '../../../../shared/messages/troubleshooting.mjs';
import type { JavaEnvironment, JavaSpawn } from '../../adapters/typed/java-values.mts';
import { javaCommand } from '../programs/java-command.mts';

export type Installed = { readonly java: string; readonly feature: number | undefined };
export type FeatureJdk = { readonly java: string; readonly feature: number };
export type JdkChoice =
  | { readonly java: string; readonly problem?: undefined }
  | { readonly problem: string; readonly java?: undefined };
type Described = Installed & { readonly missing: boolean };
type HomesOptions = {
  readonly env?: JavaEnvironment;
  readonly home?: string;
  readonly systemJdks?: readonly string[];
};

const VERSION = /version "(?:1\.)?(\d+)/u;
const VERSIONED_HOME = /^JAVA_HOME_\d+_(?:X64|ARM64|AARCH64)$/u;
const JDK_HOME = /<jdkHome>([^<]*)<\/jdkHome>/gu;
const SYSTEM_JDKS = ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines'];
const JAVA = 'java';

export function featureVersion(versionOutput: string): number | undefined {
  const match = VERSION.exec(versionOutput);
  return match === null ? undefined : Number(match[1]);
}

function subdirectories(directory: string): string[] {
  return existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => path.join(directory, entry.name))
    : [];
}

export function jdkHomes({
  env = process.env,
  home = homedir(),
  systemJdks = SYSTEM_JDKS,
}: HomesOptions = {}): string[] {
  const toolchains = path.join(home, '.m2', 'toolchains.xml');
  const declared = existsSync(toolchains)
    ? [...readFileSync(toolchains, 'utf8').matchAll(JDK_HOME)]
        .flatMap(([, jdkHome]) => (jdkHome === undefined ? [] : [jdkHome.trim()]))
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
    .flatMap((name) => env[name] ?? []);
  return [...new Set([...variables, ...declared, ...installed])].filter((jdk) =>
    existsSync(path.join(jdk, 'bin', JAVA)),
  );
}

function describe(java: string, spawn: JavaSpawn): Described {
  const result = spawn(java, ['-version'], { encoding: 'utf8' });
  if (fieldOf(result.error, 'code') === 'ENOENT') {
    return { java, missing: true, feature: undefined };
  }
  return { java, missing: false, feature: featureVersion(`${result.stderr}${result.stdout}`) };
}

export function installedJdks(spawn: JavaSpawn): Installed[] {
  return jdkHomes().map((jdk) => describe(path.join(jdk, 'bin', JAVA), spawn));
}

export function featureJdks(installed: readonly Installed[]): FeatureJdk[] {
  return installed.filter((jdk): jdk is FeatureJdk => jdk.feature !== undefined);
}

export function projectJava(spawn: JavaSpawn): FeatureJdk {
  const project = describe(javaCommand(JAVA), spawn);
  if (project.missing) {
    throw explainedError(
      `java not found (${project.java}): set JAVA_HOME to a JDK, or put its bin directory on the PATH`,
    );
  }
  if (project.feature === undefined) {
    throw new Error(`nitpicker could not read the version of ${project.java} (java -version)`);
  }
  return { java: project.java, feature: project.feature };
}
