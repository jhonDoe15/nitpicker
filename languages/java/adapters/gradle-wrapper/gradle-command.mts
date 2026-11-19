import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

type SpawnTarget = { readonly command: string; readonly args: string[]; readonly shell: boolean };
type GradleRequest = {
  readonly projectRoot: string;
  readonly configured: string | undefined;
  readonly args: readonly string[];
  readonly platform?: NodeJS.Platform | undefined;
};
type TargetRequest = GradleRequest & {
  readonly wrapper: string;
  readonly windowsWrapper: string;
  readonly tool: string;
};

const EXECUTABLE_BITS = 0o111;
const WINDOWS_SCRIPT = /\.(?:bat|cmd)$/iu;

export function gradleTarget(options: GradleRequest): SpawnTarget {
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
}: TargetRequest): SpawnTarget {
  if (configured !== undefined && configured !== '') {
    return spawnTarget(configured, args);
  }
  if (platform === 'win32') {
    const script = path.join(projectRoot, windowsWrapper);
    return existsSync(script)
      ? spawnTarget(script, args)
      : { command: tool, args: args.map(quoted), shell: true };
  }
  const script = path.join(projectRoot, wrapper);
  const stat = statSync(script, { throwIfNoEntry: false });
  if (stat === undefined || !stat.isFile()) {
    return { command: tool, args: [...args], shell: false };
  }
  return (stat.mode & EXECUTABLE_BITS) === 0
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
