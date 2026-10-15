import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const EXECUTABLE_BITS = 0o111;
const WINDOWS_SCRIPT = /\.(?:bat|cmd)$/iu;

export function gradleTarget(options) {
  return wrapperTarget({
    ...options,
    wrapper: 'gradlew',
    windowsWrapper: 'gradlew.bat',
    tool: 'gradle',
  });
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
    const script = path.join(projectRoot, windowsWrapper);
    return existsSync(script) ? spawnTarget(script, args) : { command: tool, args, shell: true };
  }
  const script = path.join(projectRoot, wrapper);
  const stat = statSync(script, { throwIfNoEntry: false });
  if (stat === undefined || !stat.isFile()) {
    return { command: tool, args, shell: false };
  }
  return (stat.mode & EXECUTABLE_BITS) === 0
    ? { command: 'sh', args: [script, ...args], shell: false }
    : { command: script, args, shell: false };
}

function spawnTarget(command, args) {
  if (!WINDOWS_SCRIPT.test(command)) {
    return { command, args, shell: false };
  }
  return { command: `"${command}"`, args: args.map((arg) => `"${arg}"`), shell: true };
}
