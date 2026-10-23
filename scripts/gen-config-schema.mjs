import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { buildConfigSchema } from '../core/configuration/schema/config-schema.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const SCHEMA_FILE = path.join(repositoryRoot, 'spec/config.schema.json');

export async function renderConfigSchema() {
  const options = (await resolveConfig(SCHEMA_FILE)) ?? {};
  return format(JSON.stringify(buildConfigSchema()), { ...options, parser: 'json' });
}

export async function isStale() {
  return (await renderConfigSchema()) !== readFileSync(SCHEMA_FILE, 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  writeFileSync(SCHEMA_FILE, await renderConfigSchema());
}
