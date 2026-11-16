import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from '../../../../core/fix/common/contained-path.mjs';
import { failureText, fixSpawn, runFixCommand } from '../../../../core/fix/common/fix-command.mjs';
import { gradleTarget } from '../../adapters/gradle-wrapper/gradle-command.mjs';
import { detectJavaBuild } from '../../builds/java-build.mjs';
import {
  cacheDirectory,
  dependency,
  missing,
  readClasspaths,
  resolveToolSet,
  toolsKey,
} from '../../maven/maven-tools.mjs';
import { resolutionSettings } from './project-repositories.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, fieldsOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

type ToolSpec = { readonly coordinates: string; readonly transitive: boolean };
type Tools = Readonly<Record<string, ToolSpec>>;
type Classpaths = Record<string, readonly string[]>;
type Environment = Readonly<Record<string, string | undefined>>;
type Resolution = {
  readonly projectRoot: string;
  readonly tools: Tools;
  readonly environment: Environment;
  readonly executeFixCommand: unknown;
};
type ToolResolution = Omit<Resolution, 'environment'> & {
  readonly environment?: Environment;
  readonly buildTool?: unknown;
};

export const FIX_TOOLS_BUILD = path.join(import.meta.dirname, 'fix-tools.build.gradle');
const MARKER = 'nitpicker-fix-tool';
const SETTINGS_FILES = ['settings.gradle', 'settings.gradle.kts'];
const MILLISECONDS_PER_MINUTE = 60_000;
export const TOOL_RESOLUTION_TIMEOUT_MS = 15 * MILLISECONDS_PER_MINUTE;

export function gradleToolArguments(tools: Tools, directory: string): string[] {
  const specs = Object.entries(tools).map(
    ([name, { coordinates, transitive }]) => `${name}=${coordinates}${transitive ? '' : '!'}`,
  );
  return [
    '--console=plain',
    '--quiet',
    '--no-configuration-cache',
    '--project-dir',
    directory,
    `-Pnitpicker.fix.tools=${specs.join(',')}`,
    'nitpickerFixTools',
  ];
}

export function parseToolClasspaths(stdout: string): Classpaths {
  return Object.fromEntries(
    stdout
      .split(/\r?\n/u)
      .filter((line) => line.startsWith(`${MARKER}\t`))
      .map((line) => {
        const [, name = '', classpath = ''] = line.split('\t');
        return [name, classpath.split(path.delimiter)];
      }),
  );
}

function writeResolutionBuild(projectRoot: string, directory: string): string[] {
  mkdirSync(directory, { recursive: true });
  const settings = resolutionSettings(projectRoot);
  for (const name of SETTINGS_FILES) {
    rmSync(containedPath(directory, name), { force: true });
  }
  writeFileSync(containedPath(directory, settings.file), settings.text);
  copyFileSync(FIX_TOOLS_BUILD, containedPath(directory, 'build.gradle'));
  const properties: string = containedPath(projectRoot, 'gradle.properties');
  rmSync(containedPath(directory, 'gradle.properties'), { force: true });
  if (existsSync(properties)) {
    copyFileSync(properties, containedPath(directory, 'gradle.properties'));
  }
  return settings.sources;
}

function resolutionHint(directory: string, sources: readonly string[]): string {
  const repositories =
    sources.length === 0
      ? 'Maven Central, since the project declares no repositories'
      : `the repositories declared in ${sources.join(' and ')}`;
  return `nitpicker resolves the formatter jars in its own build at ${directory}, from ${repositories}`;
}

function storeClasspaths(directory: string, classpaths: Classpaths): void {
  for (const [name, jars] of Object.entries(classpaths)) {
    const toolDirectory: string = containedPath(directory, name);
    mkdirSync(toolDirectory, { recursive: true });
    writeFileSync(containedPath(toolDirectory, 'classpath.txt'), jars.join(path.delimiter));
  }
}

function classpathsOf(value: unknown): Classpaths {
  return Object.fromEntries(
    Object.entries(fieldsOf(value)).map(([name, jars]) => [name, textsOf(jars)]),
  );
}

function resolveWithGradle({ projectRoot, tools, environment, executeFixCommand }: Resolution) {
  const directory = textOf(cacheDirectory(`gradle-tools-${textOf(toolsKey(tools))}`));
  const cached = classpathsOf(readClasspaths(directory, Object.keys(tools)));
  if (textsOf(missing(cached)).length === 0) {
    return cached;
  }
  const sources = writeResolutionBuild(projectRoot, directory);
  const target = callUntyped(gradleTarget, {
    projectRoot,
    configured: environment['NITPICKER_GRADLE'] || undefined,
    args: gradleToolArguments(tools, directory),
  });
  const result = callUntyped(runFixCommand, {
    operation: 'fix-tools',
    command: fieldOf(target, 'command'),
    args: fieldOf(target, 'args'),
    cwd: directory,
    acceptedStatuses: [0],
    shell: fieldOf(target, 'shell'),
    timeout: TOOL_RESOLUTION_TIMEOUT_MS,
    executeFixCommand,
    describe: (failed: unknown) =>
      `${textOf(failureText(failed))} (${resolutionHint(directory, sources)})`,
  });
  const classpaths = parseToolClasspaths(textOf(fieldOf(result, 'stdout')));
  storeClasspaths(directory, classpaths);
  return classpaths;
}

function resolveWithMaven({
  projectRoot,
  tools,
  environment,
  executeFixCommand,
}: Resolution): Classpaths {
  const dependencies = Object.fromEntries(
    Object.entries(tools).map(([name, { coordinates, transitive }]) => [
      name,
      [dependency(coordinates, transitive ? [] : ['*'])],
    ]),
  );
  return classpathsOf(
    callUntyped(resolveToolSet, {
      projectRoot,
      maven: environment['NITPICKER_MAVEN'] || undefined,
      tools: dependencies,
      spawn: callUntyped(fixSpawn, { operation: 'fix-tools', executeFixCommand }),
    }),
  );
}

export function resolveToolClasspaths({
  environment = {},
  buildTool,
  ...settings
}: ToolResolution): Classpaths {
  const resolve =
    detectJavaBuild(settings.projectRoot, buildTool) === 'maven'
      ? resolveWithMaven
      : resolveWithGradle;
  const classpaths = resolve({ ...settings, environment });
  const unresolved = Object.keys(settings.tools).filter((name) => classpaths[name] === undefined);
  if (unresolved.length > 0) {
    throw new Error(`The build resolved no jars for ${unresolved.join(', ')}`);
  }
  return classpaths;
}
