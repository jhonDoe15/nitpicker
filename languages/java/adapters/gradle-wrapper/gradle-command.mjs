import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const EXECUTABLE_BITS = 0o111;
const WINDOWS_SCRIPT = /\.(?:bat|cmd)$/iu;

export function gradleTarget({ projectRoot, configured, args, platform = process.platform }) {
  if (configured) {
    return spawnTarget(configured, args);
  }
  if (platform === 'win32') {
    const wrapper = path.join(projectRoot, 'gradlew.bat');
    return existsSync(wrapper)
      ? spawnTarget(wrapper, args)
      : { command: 'gradle', args: args.map((arg) => quoted(arg)), shell: true };
  }
  const wrapper = path.join(projectRoot, 'gradlew');
  const stat = statSync(wrapper, { throwIfNoEntry: false });
  if (stat === undefined || !stat.isFile()) {
    return { command: 'gradle', args, shell: false };
  }
  return (stat.mode & EXECUTABLE_BITS) === 0
    ? { command: 'sh', args: [wrapper, ...args], shell: false }
    : { command: wrapper, args, shell: false };
}

function spawnTarget(command, args) {
  if (!WINDOWS_SCRIPT.test(command)) {
    return { command, args, shell: false };
  }
  return { command: quoted(command), args: args.map((arg) => quoted(arg)), shell: true };
}

function quoted(word) {
  return `"${word}"`;
}
