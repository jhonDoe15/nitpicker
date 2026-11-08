import { existsSync } from 'node:fs';
import path from 'node:path';
import { readJsonc } from '../../modules/tsconfig-files.mjs';

const NEST_CORE = '@nestjs/core';
const NEST_CLI_CONFIG = 'nest-cli.json';
const ENTRY_EXTENSIONS = ['ts', 'mts', 'js', 'mjs'];

function isPlainRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonObject(file) {
  const value = existsSync(file) ? readJsonc(file) : undefined;
  return isPlainRecord(value) ? value : {};
}

export function isNestProject(projectRoot) {
  const manifest = readJsonObject(path.join(projectRoot, 'package.json'));
  return [manifest.dependencies, manifest.peerDependencies].some((dependencies) =>
    Object.hasOwn(dependencies ?? {}, NEST_CORE),
  );
}

function configuredText(value, fallback) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function entryOf(config, fallback) {
  const sourceRoot = configuredText(config.sourceRoot, fallback.sourceRoot);
  const entryFile = configuredText(config.entryFile, fallback.entryFile);
  return path.posix.normalize(`${sourceRoot}/${entryFile}`);
}

function existingEntry(projectRoot, file) {
  const root = path.resolve(projectRoot);
  const full = path.resolve(root, file);
  if (!full.startsWith(root + path.sep)) {
    return undefined;
  }
  return existsSync(full) ? file : undefined;
}

export function nestEntryPoints(projectRoot) {
  if (!isNestProject(projectRoot)) {
    return [];
  }
  const cli = readJsonObject(path.join(projectRoot, NEST_CLI_CONFIG));
  const defaults = { sourceRoot: 'src', entryFile: configuredText(cli.entryFile, 'main') };
  const projectEntries = Object.values(isPlainRecord(cli.projects) ? cli.projects : {})
    .filter(isPlainRecord)
    .map((project) => entryOf(project, defaults));
  const entries = [...new Set([entryOf(cli, defaults), ...projectEntries])];
  return entries
    .flatMap((entry) =>
      ENTRY_EXTENSIONS.map((extension) => existingEntry(projectRoot, `${entry}.${extension}`)),
    )
    .filter((file) => file !== undefined);
}
