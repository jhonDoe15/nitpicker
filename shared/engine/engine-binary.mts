import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Environment = Readonly<Record<string, string | undefined>>;

export type EngineHost = {
  readonly platform: string;
  readonly arch: string;
  readonly root: string;
  readonly exists: (file: string) => boolean;
};

const ENGINE_OVERRIDE = 'NITPICKER_ENGINE';
const ENGINE_OFF = 'off';

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function currentHost(): EngineHost {
  return { platform: process.platform, arch: process.arch, root: PACKAGE_ROOT, exists: existsSync };
}

export function engineCandidates({ platform, arch, root }: EngineHost): string[] {
  const name = platform === 'win32' ? 'nitpicker-engine.exe' : 'nitpicker-engine';
  return [
    path.join(root, 'engine', 'bin', `${platform}-${arch}`, name),
    path.join(root, 'engine', 'target', 'release', name),
  ];
}

export function findEngine(
  environment: Environment = process.env,
  host: EngineHost = currentHost(),
): string | undefined {
  const chosen = environment[ENGINE_OVERRIDE];
  if (chosen === ENGINE_OFF) {
    return undefined;
  }
  const candidates =
    chosen === undefined || chosen === '' ? engineCandidates(host) : [path.resolve(chosen)];
  return candidates.find((candidate) => host.exists(candidate));
}
