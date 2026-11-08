import { existsSync } from 'node:fs';
import path from 'node:path';
import { readJsonc } from '../../modules/tsconfig-files.mjs';

const NEST_CORE = '@nestjs/core';
const NEST_CLI_CONFIG = 'nest-cli.json';
const ENTRY_EXTENSIONS = ['ts', 'mts', 'js', 'mjs'];

function readJsonObject(file) {
  const value = existsSync(file) ? readJsonc(file) : undefined;
  return typeof value === 'object' && value !== null ? value : {};
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

export function nestEntryPoints(projectRoot) {
  if (!isNestProject(projectRoot)) {
    return [];
  }
  const cli = readJsonObject(path.join(projectRoot, NEST_CLI_CONFIG));
  const entry = path.posix.join(
    configuredText(cli.sourceRoot, 'src'),
    configuredText(cli.entryFile, 'main'),
  );
  return ENTRY_EXTENSIONS.map((extension) => `${entry}.${extension}`).filter((file) =>
    existsSync(path.join(projectRoot, file)),
  );
}
