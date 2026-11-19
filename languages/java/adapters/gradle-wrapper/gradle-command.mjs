import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const EXECUTABLE_BITS = 0o111;
const WINDOWS_SCRIPT = /\.(?:bat|cmd)$/iu;
const BUILD_ROOT_MARKERS = ['.git', '.mvn', 'settings.gradle', 'settings.gradle.kts'];
const WRAPPER_PROPERTIES = path.join('gradle', 'wrapper', 'gradle-wrapper.properties');
const ISOLATED_PROJECTS = /^\s*(org\.gradle\.(?:unsafe\.)?isolated-projects)\s*[=:]\s*true\s*$/gmu;
const PINNED_GRADLE = /^distributionUrl=.*gradle-([\d.]+(?:-[\w.]+)?)-(?:bin|all)\.zip\s*$/mu;

export function gradleTarget(options) {
  return wrapperTarget({
    ...options,
    args: [...isolatedProjectsOff(options.projectRoot), ...options.args],
    wrapper: 'gradlew',
    windowsWrapper: 'gradlew.bat',
    tool: 'gradle',
  });
}

function buildFolders(projectRoot) {
  const folders = [];
  let folder = path.resolve(projectRoot);
  for (;;) {
    folders.push(folder);
    const parent = path.dirname(folder);
    if (
      parent === folder ||
      BUILD_ROOT_MARKERS.some((marker) => existsSync(path.join(folder, marker)))
    ) {
      return folders;
    }
    folder = parent;
  }
}

function nearestFile(projectRoot, name) {
  return buildFolders(projectRoot)
    .map((folder) => path.join(folder, name))
    .find((file) => statSync(file, { throwIfNoEntry: false })?.isFile() === true);
}

function textIfFile(file) {
  return statSync(file, { throwIfNoEntry: false })?.isFile() === true
    ? readFileSync(file, 'utf8')
    : '';
}

export function gradlePropertiesTexts(projectRoot, environment = process.env) {
  const userHome = environment['GRADLE_USER_HOME'] || path.join(homedir(), '.gradle');
  return [...buildFolders(projectRoot), userHome].map((folder) =>
    textIfFile(path.join(folder, 'gradle.properties')),
  );
}

export function isolatedProjectsOff(projectRoot, environment = process.env) {
  const properties = gradlePropertiesTexts(projectRoot, environment);
  const names = properties.flatMap((text) =>
    [...text.matchAll(ISOLATED_PROJECTS)].map((match) => match[1]),
  );
  return [...new Set(names)].toSorted().map((name) => `-D${name}=false`);
}

export function pinnedGradleVersion(projectRoot) {
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
}) {
  if (configured) {
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
    return { command: tool, args, shell: false };
  }
  return (statSync(script).mode & EXECUTABLE_BITS) === 0
    ? { command: 'sh', args: [script, ...args], shell: false }
    : { command: script, args, shell: false };
}

function spawnTarget(command, args) {
  if (!WINDOWS_SCRIPT.test(command)) {
    return { command, args, shell: false };
  }
  return { command: quoted(command), args: args.map(quoted), shell: true };
}

function quoted(word) {
  return `"${word}"`;
}
