import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

type SpawnTarget = { readonly command: string; readonly args: string[]; readonly shell: boolean };
type GradleRequest = {
  readonly projectRoot: string;
  readonly configured: string | undefined;
  readonly args: readonly string[];
  readonly platform?: NodeJS.Platform | undefined;
  readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
};
type TargetRequest = GradleRequest & {
  readonly wrapper: string;
  readonly windowsWrapper: string;
  readonly tool: string;
};

const EXECUTABLE_BITS = 0o111;
const WINDOWS_SCRIPT = /\.(?:bat|cmd)$/iu;
const BUILD_ROOT_MARKERS = ['.git', '.mvn', 'settings.gradle', 'settings.gradle.kts'];
const WRAPPER_PROPERTIES = path.join('gradle', 'wrapper', 'gradle-wrapper.properties');
const ISOLATED_PROJECTS = /^\s*(org\.gradle\.(?:unsafe\.)?isolated-projects)\s*[=:]\s*true\s*$/gmu;
const PINNED_GRADLE = /^distributionUrl=.*gradle-([\d.]+(?:-[\w.]+)?)-(?:bin|all)\.zip\s*$/mu;

export function gradleTarget(options: GradleRequest): SpawnTarget {
  return wrapperTarget({
    ...options,
    args: [...isolatedProjectsOff(options.projectRoot, options.environment ?? {}), ...options.args],
    wrapper: 'gradlew',
    windowsWrapper: 'gradlew.bat',
    tool: 'gradle',
  });
}

function childPath(folder: string, name: string): string | undefined {
  const base = folder.endsWith(path.sep) ? folder : folder + path.sep;
  const full = path.resolve(folder, name);
  return full.startsWith(base) ? full : undefined;
}

function isFile(file: string | undefined): file is string {
  return file !== undefined && statSync(file, { throwIfNoEntry: false })?.isFile() === true;
}

function ancestors(folder: string): string[] {
  const folders = [folder];
  for (const current of folders) {
    const parent = path.dirname(current);
    if (parent !== current) {
      folders.push(parent);
    }
  }
  return folders;
}

function buildFolders(projectRoot: string): string[] {
  const folders = ancestors(path.resolve(projectRoot));
  const root = folders.findIndex((folder) =>
    BUILD_ROOT_MARKERS.some((marker) => {
      const file = childPath(folder, marker);
      return file !== undefined && existsSync(file);
    }),
  );
  return root === -1 ? folders : folders.slice(0, root + 1);
}

function nearestFile(projectRoot: string, name: string): string | undefined {
  return buildFolders(projectRoot)
    .map((folder) => childPath(folder, name))
    .find(isFile);
}

function textIfFile(file: string | undefined): string {
  return isFile(file) ? readFileSync(file, 'utf8') : '';
}

export function gradlePropertiesTexts(
  projectRoot: string,
  environment: Readonly<Record<string, string | undefined>>,
): string[] {
  const userHome = environment['GRADLE_USER_HOME'] || path.join(homedir(), '.gradle');
  return [...buildFolders(projectRoot), path.resolve(userHome)].map((folder) =>
    textIfFile(childPath(folder, 'gradle.properties')),
  );
}

export function isolatedProjectsOff(
  projectRoot: string,
  environment: Readonly<Record<string, string | undefined>>,
): string[] {
  const properties = gradlePropertiesTexts(projectRoot, environment);
  const names = properties.flatMap((text) =>
    [...text.matchAll(ISOLATED_PROJECTS)].map((match) => match[1] ?? ''),
  );
  return [...new Set(names)]
    .toSorted((left, right) => left.localeCompare(right))
    .map((name) => `-D${name}=false`);
}

export function pinnedGradleVersion(projectRoot: string): string | undefined {
  const properties = nearestFile(projectRoot, WRAPPER_PROPERTIES);
  return properties === undefined
    ? undefined
    : PINNED_GRADLE.exec(readFileSync(properties, 'utf8'))?.[1];
}

export function wrapperTarget({
  projectRoot,
  configured,
  args,
  platform = process.platform,
  wrapper,
  windowsWrapper,
  tool,
}: TargetRequest): SpawnTarget {
  if (configured !== undefined && configured !== '') {
    return spawnTarget(configured, args);
  }
  if (platform === 'win32') {
    const script = nearestFile(projectRoot, windowsWrapper);
    return script === undefined
      ? { command: tool, args: args.map(quoted), shell: true }
      : spawnTarget(script, args);
  }
  const script = nearestFile(projectRoot, wrapper);
  if (script === undefined) {
    return { command: tool, args: [...args], shell: false };
  }
  return (statSync(script).mode & EXECUTABLE_BITS) === 0
    ? { command: 'sh', args: [script, ...args], shell: false }
    : { command: script, args: [...args], shell: false };
}

function spawnTarget(command: string, args: readonly string[]): SpawnTarget {
  if (!WINDOWS_SCRIPT.test(command)) {
    return { command, args: [...args], shell: false };
  }
  return { command: quoted(command), args: args.map(quoted), shell: true };
}

function quoted(word: string): string {
  return `"${word}"`;
}
