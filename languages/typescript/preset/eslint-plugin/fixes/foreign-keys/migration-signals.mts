import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories as untypedAncestorDirectories } from '../../../../../../shared/filesystem.mjs';

const ancestorDirectories: (directory: string) => string[] = untypedAncestorDirectories;

const SCRIPT_SIGNAL = /migration|drizzle-kit\s+(?:generate|migrate)|schema:log/u;
const CONFIG_SIGNAL = /\bmigrations\w*\s*:|\bmigrations\w*\s*[,}]|synchronize\s*:\s*false/u;
const MIGRATION_PACKAGES = ['@mikro-orm/migrations'];
const CONFIG_NAMES = ['data-source', 'ormconfig', 'mikro-orm.config', 'typeorm.config'];
const CONFIG_EXTENSIONS = ['ts', 'mts', 'js', 'mjs', 'cjs', 'json'];
const CONFIG_FOLDERS = ['', 'src'];

function readText(file: string): string | undefined {
  try {
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function manifestSignal(text: string): boolean {
  let manifest: unknown;
  try {
    manifest = JSON.parse(text);
  } catch {
    return true;
  }
  if (!isRecord(manifest)) {
    return true;
  }
  const scripts = isRecord(manifest['scripts']) ? Object.values(manifest['scripts']) : [];
  const dependencies = [manifest['dependencies'], manifest['devDependencies']].flatMap((section) =>
    isRecord(section) ? Object.keys(section) : [],
  );
  return (
    scripts.some((script) => typeof script === 'string' && SCRIPT_SIGNAL.test(script)) ||
    dependencies.some((name) => MIGRATION_PACKAGES.includes(name))
  );
}

function configFiles(directory: string): string[] {
  return CONFIG_FOLDERS.flatMap((folder) =>
    CONFIG_NAMES.flatMap((name) =>
      CONFIG_EXTENSIONS.map((extension) => path.join(directory, folder, `${name}.${extension}`)),
    ),
  );
}

function directorySignal(directory: string): boolean {
  const manifest = readText(path.join(directory, 'package.json'));
  if (manifest === undefined) {
    return false;
  }
  return (
    manifestSignal(manifest) ||
    configFiles(directory).some((file) => CONFIG_SIGNAL.test(readText(file) ?? ''))
  );
}

export function hasMigrationSignal(filename: string, text: string): boolean {
  return (
    CONFIG_SIGNAL.test(text) || ancestorDirectories(path.dirname(filename)).some(directorySignal)
  );
}
