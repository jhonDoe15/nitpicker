import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readStamped } from '../../../modules/stamped-file-cache.mjs';

const SCHEMA = 'schema.prisma';
const SCHEMA_FILES = [path.join('prisma', SCHEMA), SCHEMA];
const SCHEMA_FOLDER = path.join('prisma', 'schema');
const CLIENT_ENTRIES = ['index.d.ts', 'client.d.ts', 'client.ts'];
const CLIENT_DEPTH = 2;
const CLIENT_PROVIDERS = new Set(['prisma-client-js', 'prisma-client']);
const GENERATOR = /generator\s+\w+\s*\{([^}]*)\}/gu;
const PROVIDER = /provider\s*=\s*"([^"]+)"/u;
const OUTPUT = /output\s*=\s*"([^"]+)"/u;

const schemaOutputs = new Map();
const splitSchemas = new Map();

function childPath(directory, name) {
  const base = path.resolve(directory);
  const child = path.resolve(base, name);
  if (!child.startsWith(`${base}${path.sep}`)) {
    return undefined;
  }
  return child;
}

function generatorOutputs(file) {
  const outputs = [];
  for (const [, body] of readFileSync(file, 'utf8').matchAll(GENERATOR)) {
    const provider = PROVIDER.exec(body)?.[1];
    const output = OUTPUT.exec(body)?.[1];
    if (CLIENT_PROVIDERS.has(provider) && output !== undefined) {
      outputs.push(path.resolve(path.dirname(file), output));
    }
  }
  return outputs;
}

function prismaFilesIn(folder) {
  return readdirSync(folder)
    .filter((name) => name.endsWith('.prisma'))
    .map((name) => path.join(folder, name));
}

function schemaFiles(directory) {
  const folder = childPath(directory, SCHEMA_FOLDER);
  const split = folder === undefined ? undefined : readStamped(splitSchemas, folder, prismaFilesIn);
  const single = SCHEMA_FILES.map((name) => childPath(directory, name));
  return [...single, ...(split ?? [])].filter((file) => file !== undefined);
}

function outputsOf(directory) {
  return schemaFiles(directory).flatMap(
    (file) => readStamped(schemaOutputs, file, generatorOutputs) ?? [],
  );
}

function hasChild(directory, name) {
  const file = childPath(directory, name);
  return file !== undefined && existsSync(file);
}

function isClientDirectory(directory) {
  return hasChild(directory, SCHEMA) && CLIENT_ENTRIES.some((name) => hasChild(directory, name));
}

function ancestors(fileName) {
  const parts = path.dirname(fileName).split(path.sep);
  return parts.map((_, index) => parts.slice(0, index + 1).join(path.sep) || path.sep).reverse();
}

function inside(fileName, directory) {
  const relative = path.relative(directory, fileName);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function isGeneratedPrismaClient(fileName) {
  const directories = ancestors(path.resolve(fileName));
  return (
    directories.slice(0, CLIENT_DEPTH).some((directory) => isClientDirectory(directory)) ||
    directories.some((directory) => outputsOf(directory).some((output) => inside(fileName, output)))
  );
}
