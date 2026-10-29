import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from '../../../../core/fix/common/contained-path.mjs';
import { fixSpawn, runFixCommand } from '../../../../core/fix/common/fix-command.mjs';
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

export const FIX_TOOLS_BUILD = path.join(import.meta.dirname, 'fix-tools.build.gradle');
const MARKER = 'nitpicker-fix-tool';
const MILLISECONDS_PER_MINUTE = 60_000;
export const TOOL_RESOLUTION_TIMEOUT_MS = 15 * MILLISECONDS_PER_MINUTE;

export function gradleToolArguments(tools, directory) {
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

export function parseToolClasspaths(stdout) {
  return Object.fromEntries(
    stdout
      .split(/\r?\n/u)
      .filter((line) => line.startsWith(`${MARKER}\t`))
      .map((line) => {
        const [, name, classpath] = line.split('\t');
        return [name, classpath.split(path.delimiter)];
      }),
  );
}

function writeResolutionBuild(directory) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    containedPath(directory, 'settings.gradle'),
    "rootProject.name = 'nitpicker-fix-tools'\n",
  );
  copyFileSync(FIX_TOOLS_BUILD, containedPath(directory, 'build.gradle'));
}

function storeClasspaths(directory, classpaths) {
  for (const [name, jars] of Object.entries(classpaths)) {
    const toolDirectory = containedPath(directory, name);
    mkdirSync(toolDirectory, { recursive: true });
    writeFileSync(containedPath(toolDirectory, 'classpath.txt'), jars.join(path.delimiter));
  }
}

function resolveWithGradle({ projectRoot, tools, environment, executeFixCommand }) {
  const directory = cacheDirectory(`gradle-tools-${toolsKey(tools)}`);
  const cached = readClasspaths(directory, Object.keys(tools));
  if (missing(cached).length === 0) {
    return cached;
  }
  writeResolutionBuild(directory);
  const target = gradleTarget({
    projectRoot,
    configured: environment.NITPICKER_GRADLE || undefined,
    args: gradleToolArguments(tools, directory),
  });
  const result = runFixCommand({
    operation: 'fix-tools',
    command: target.command,
    args: target.args,
    cwd: directory,
    acceptedStatuses: [0],
    shell: target.shell,
    timeout: TOOL_RESOLUTION_TIMEOUT_MS,
    executeFixCommand,
  });
  const classpaths = parseToolClasspaths(result.stdout);
  storeClasspaths(directory, classpaths);
  return classpaths;
}

function resolveWithMaven({ projectRoot, tools, environment, executeFixCommand }) {
  const dependencies = Object.fromEntries(
    Object.entries(tools).map(([name, { coordinates, transitive }]) => [
      name,
      [dependency(coordinates, transitive ? [] : ['*'])],
    ]),
  );
  return resolveToolSet({
    projectRoot,
    maven: environment.NITPICKER_MAVEN || undefined,
    tools: dependencies,
    spawn: fixSpawn({ operation: 'fix-tools', executeFixCommand }),
  });
}

export function resolveToolClasspaths({ environment = {}, ...settings }) {
  const resolve =
    detectJavaBuild(settings.projectRoot) === 'maven' ? resolveWithMaven : resolveWithGradle;
  const classpaths = resolve({ ...settings, environment });
  const unresolved = Object.keys(settings.tools).filter((name) => classpaths[name] === undefined);
  if (unresolved.length > 0) {
    throw new Error(`The build resolved no jars for ${unresolved.join(', ')}`);
  }
  return classpaths;
}
