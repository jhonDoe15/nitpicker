import path from 'node:path';
import { nearestManifest } from '../../../rules/dependencies/package-manifest.mts';
import { parseJsonText, readFileText } from '../../support/project/read-file.mts';

const NODE_MODULES = '/node_modules/';
const VERSION = /^(\d+)\.(\d+)/u;

export function projectDependencies(filename: string): ReadonlySet<string> {
  const names = new Set<string>();
  const pending = [path.dirname(filename)];
  for (const directory of pending) {
    const manifest = nearestManifest(directory);
    if (manifest?.kind !== 'manifest') {
      continue;
    }
    for (const name of [...manifest.runtime, ...manifest.development]) {
      names.add(name);
    }
    const parent = path.dirname(path.dirname(manifest.file));
    if (parent === path.dirname(manifest.file)) {
      break;
    }
    pending.push(parent);
  }
  return names;
}

export function packageVersion(declarationFile: string, name: string): string | undefined {
  const normalized = declarationFile.replaceAll('\\', '/');
  const index = normalized.lastIndexOf(NODE_MODULES);
  if (index === -1) {
    return undefined;
  }
  const base = path.resolve(normalized.slice(0, index + NODE_MODULES.length));
  const folder = path.resolve(base, name);
  if (!folder.startsWith(`${base}${path.sep}`)) {
    return undefined;
  }
  const read = readFileText(path.resolve(folder, 'package.json'));
  const parsed = read.kind === 'text' ? parseJsonText(read.text) : read;
  return parsed.kind === 'json' ? versionOf(parsed.value) : undefined;
}

function versionOf(manifest: unknown): string | undefined {
  const version: unknown =
    typeof manifest === 'object' && manifest !== null
      ? Reflect.get(manifest, 'version')
      : undefined;
  return typeof version === 'string' ? version : undefined;
}

const TYPEORM_MINOR = 3;

export function isModernTypeorm(version: string | undefined): boolean {
  return isAtLeast(version, 0, TYPEORM_MINOR);
}

export function isAtLeast(version: string | undefined, major: number, minor: number): boolean {
  const match = VERSION.exec(version ?? '');
  if (match === null) {
    return false;
  }
  const found = Number(match[1]);
  return found > major || (found === major && Number(match[2]) >= minor);
}
