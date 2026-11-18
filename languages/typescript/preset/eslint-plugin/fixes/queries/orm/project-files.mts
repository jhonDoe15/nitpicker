import { readFileSync } from 'node:fs';
import path from 'node:path';
import { nearestManifest } from '../../../rules/dependencies/package-manifest.mts';

const NODE_MODULES = '/node_modules/';
const VERSION = /^(\d+)\.(\d+)/u;

export function projectDependencies(filename: string): ReadonlySet<string> {
  const names = new Set<string>();
  const pending = [path.dirname(filename)];
  for (const directory of pending) {
    const manifest = nearestManifest(directory);
    if (manifest?.kind === 'manifest') {
      for (const name of [...manifest.runtime, ...manifest.development]) {
        names.add(name);
      }
      const parent = path.dirname(path.dirname(manifest.file));
      pending.push(parent);
      if (parent === path.dirname(manifest.file)) {
        break;
      }
    }
  }
  return names;
}

export function packageVersion(declarationFile: string, name: string): string | undefined {
  const normalized = declarationFile.replaceAll('\\', '/');
  const index = normalized.lastIndexOf(NODE_MODULES);
  if (index === -1) {
    return undefined;
  }
  const manifest = `${normalized.slice(0, index + NODE_MODULES.length)}${name}/package.json`;
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
    const version =
      typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'version') : undefined;
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

export function isAtLeast(version: string | undefined, major: number, minor: number): boolean {
  const match = version === undefined ? null : VERSION.exec(version);
  if (match === null) {
    return false;
  }
  const found = Number(match[1]);
  return found > major || (found === major && Number(match[2]) >= minor);
}
