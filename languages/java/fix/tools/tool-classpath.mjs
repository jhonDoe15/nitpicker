import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { runFixCommand } from '../../../../core/fix/common/fix-command.mjs';
import { gradleTarget } from '../../adapters/gradle-wrapper/gradle-command.mjs';
import { detectJavaBuild } from '../../builds/java-build.mjs';
import { dependency, resolveToolSet } from '../../maven/maven-tools.mjs';

export const FIX_TOOLS_INIT_SCRIPT = path.join(import.meta.dirname, 'fix-tools.init.gradle');
const MARKER = 'nitpicker-fix-tool';
const GRADLE_TIMEOUT_MS = 15 * 60 * 1000;

export function gradleToolArguments(tools, initScript = FIX_TOOLS_INIT_SCRIPT) {
  const specs = Object.entries(tools).map(
    ([name, { coordinates, transitive }]) => `${name}=${coordinates}${transitive ? '' : '!'}`,
  );
  return [
    '--console=plain',
    '--quiet',
    '--no-configuration-cache',
    '-I',
    initScript,
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

function resolveWithGradle({ projectRoot, tools, environment, executeFixCommand }) {
  const target = gradleTarget({
    projectRoot,
    configured: environment.NITPICKER_GRADLE || undefined,
    args: gradleToolArguments(tools),
  });
  const result = runFixCommand({
    operation: 'fix-tools',
    command: target.command,
    args: target.args,
    cwd: projectRoot,
    acceptedStatuses: [0],
    shell: target.shell,
    executeFixCommand,
  });
  return parseToolClasspaths(result.stdout);
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
    spawn: (command, args, options) =>
      executeFixCommand?.({
        operation: 'fix-tools',
        command,
        args,
        cwd: options.cwd,
        acceptedStatuses: [0],
        environment: {},
        input: undefined,
      }) ?? spawnSync(command, args, { ...options, timeout: GRADLE_TIMEOUT_MS }),
  });
}

export function resolveToolClasspaths({ environment = {}, ...settings }) {
  const resolve =
    detectJavaBuild(settings.projectRoot) === 'maven' ? resolveWithMaven : resolveWithGradle;
  const classpaths = resolve({ ...settings, environment });
  const missing = Object.keys(settings.tools).filter((name) => classpaths[name] === undefined);
  if (missing.length > 0) {
    throw new Error(`The build resolved no jars for ${missing.join(', ')}`);
  }
  return classpaths;
}
