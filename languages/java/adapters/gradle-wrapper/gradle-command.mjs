import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const EXECUTABLE_BITS = 0o111;
const WINDOWS_SCRIPT = /\.(?:bat|cmd)$/iu;

export function gradleCommand(projectRoot, configured, platform = process.platform) {
  if (configured) {
    return configured;
  }
  const wrapper = path.join(projectRoot, platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  return isRunnable(wrapper, platform) ? wrapper : 'gradle';
}

function isRunnable(file, platform) {
  if (platform === 'win32') {
    return existsSync(file);
  }
  const stat = statSync(file, { throwIfNoEntry: false });
  return stat !== undefined && stat.isFile() && (stat.mode & EXECUTABLE_BITS) !== 0;
}

export function spawnTarget(command, args) {
  if (!WINDOWS_SCRIPT.test(command)) {
    return { command, args, shell: false };
  }
  return { command: `"${command}"`, args: args.map((arg) => `"${arg}"`), shell: true };
}
