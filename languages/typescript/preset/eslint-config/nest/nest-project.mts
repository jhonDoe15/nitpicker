import { existsSync } from 'node:fs';
import path from 'node:path';
import { readJsonc } from '../../modules/tsconfig-files.mts';

type Fields = Readonly<Record<string, unknown>>;
type Defaults = { readonly sourceRoot: string; readonly entryFile: string };

const NEST_CORE = '@nestjs/core';
const NEST_CLI_CONFIG = 'nest-cli.json';
const ENTRY_EXTENSIONS = ['ts', 'mts', 'js', 'mjs'];

function isPlainRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonObject(file: string): Fields {
  const value = existsSync(file) ? readJsonc(file) : undefined;
  return isPlainRecord(value) ? value : {};
}

export function isNestProject(projectRoot: string): boolean {
  const manifest = readJsonObject(path.join(projectRoot, 'package.json'));
  return [manifest['dependencies'], manifest['peerDependencies']].some(
    (dependencies) => isPlainRecord(dependencies) && Object.hasOwn(dependencies, NEST_CORE),
  );
}

function configuredText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function entryOf(config: Fields, fallback: Defaults): string {
  const sourceRoot = configuredText(config['sourceRoot'], fallback.sourceRoot);
  const entryFile = configuredText(config['entryFile'], fallback.entryFile);
  return path.posix.normalize(`${sourceRoot}/${entryFile}`);
}

function existingEntry(projectRoot: string, file: string): string | undefined {
  const root = path.resolve(projectRoot);
  const full = path.resolve(root, file);
  if (!full.startsWith(root + path.sep)) {
    return undefined;
  }
  return existsSync(full) ? file : undefined;
}

export function nestEntryPoints(projectRoot: string): string[] {
  if (!isNestProject(projectRoot)) {
    return [];
  }
  const cli = readJsonObject(path.join(projectRoot, NEST_CLI_CONFIG));
  const defaults = { sourceRoot: 'src', entryFile: configuredText(cli['entryFile'], 'main') };
  const projectEntries = Object.values(isPlainRecord(cli['projects']) ? cli['projects'] : {})
    .filter(isPlainRecord)
    .map((project) => entryOf(project, defaults));
  const entries = [...new Set([entryOf(cli, defaults), ...projectEntries])];
  return entries
    .flatMap((entry) =>
      ENTRY_EXTENSIONS.map((extension) => existingEntry(projectRoot, `${entry}.${extension}`)),
    )
    .filter((file) => file !== undefined);
}
