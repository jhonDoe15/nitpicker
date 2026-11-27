import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { zipEntryOf } from '../../../../shared/archives/zip-entry.mts';

const MANIFEST = 'META-INF/MANIFEST.MF';
const VERSION_LINE = /^Lombok-Version:\s*(\S+)/mu;
const LOMBOK_COORDINATE = 'org.projectlombok:lombok:';
const FIRST_MARKING: readonly number[] = [1, 18, 34];

function manifestOf(entry: string): string | undefined {
  try {
    if (!existsSync(entry)) {
      return undefined;
    }
    if (statSync(entry).isDirectory()) {
      const file = path.join(entry, MANIFEST);
      return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
    }
    return zipEntryOf(entry, MANIFEST);
  } catch {
    return undefined;
  }
}

export function lombokVersionOf(entries: readonly string[]): string | undefined {
  for (const entry of entries) {
    const version = VERSION_LINE.exec(manifestOf(entry) ?? '')?.[1];
    if (version !== undefined) {
      return version;
    }
  }
  return undefined;
}

export function declaredLombokVersion(coordinates: readonly string[]): string | undefined {
  const declared = coordinates.find((coordinate) => coordinate.startsWith(LOMBOK_COORDINATE));
  return declared?.slice(LOMBOK_COORDINATE.length).split(':')[0];
}

export function marksGeneratedByDefault(version: string | undefined): boolean {
  const parts = (version ?? '').split(/[.-]/u).map(Number);
  for (const [at, least] of FIRST_MARKING.entries()) {
    const part = parts[at];
    if (part === undefined || Number.isNaN(part)) {
      return false;
    }
    if (part !== least) {
      return part > least;
    }
  }
  return true;
}
