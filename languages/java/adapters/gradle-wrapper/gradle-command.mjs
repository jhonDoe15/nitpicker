import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const EXECUTABLE_BITS = 0o111;
const WINDOWS_SCRIPT = /\.(?:bat|cmd)$/iu;

export function wrapperTarget({
  projectRoot,
  configured,
  args,
  platform = process.platform,
  names,
}) {
  if (configured) {
    return spawnTarget(configured, args);
  }
  if (platform === 'win32') {
    const wrapper = path.join(projectRoot, names.windows);
    return existsSync(wrapper)
      ? spawnTarget(wrapper, args)
      : { command: names.fallback, args, shell: true };
  }
  const wrapper = path.join(projectRoot, names.unix);
  const stat = statSync(wrapper, { throwIfNoEntry: false });
  if (stat === undefined || !stat.isFile()) {
    return { command: names.fallback, args, shell: false };
  }
  return (stat.mode & EXECUTABLE_BITS) === 0
    ? { command: 'sh', args: [wrapper, ...args], shell: false }
    : { command: wrapper, args, shell: false };
}

export function gradleTarget(options) {
  return wrapperTarget({
    ...options,
    names: { unix: 'gradlew', windows: 'gradlew.bat', fallback: 'gradle' },
  });
}

function spawnTarget(command, args) {
  if (!WINDOWS_SCRIPT.test(command)) {
    return { command, args, shell: false };
  }
  return { command: `"${command}"`, args: args.map((arg) => `"${arg}"`), shell: true };
}
