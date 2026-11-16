import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isStrictlyInside } from '../../../../../../shared/filesystem.mjs';
import { readStamped as untypedReadStamped } from '../../../modules/stamped-file-cache.mjs';

type Cache<Value> = Map<string, { readonly stamp: string; readonly value: Value }>;

const readStamped: <Value>(
  cache: Cache<Value>,
  file: string,
  read: (file: string) => Value,
) => Value | undefined = untypedReadStamped;

const SCHEMA = 'schema.prisma';
const SCHEMA_FILES = [path.join('prisma', SCHEMA), SCHEMA];
const SCHEMA_FOLDER = path.join('prisma', 'schema');
const CLIENT_ENTRIES = ['index.d.ts', 'client.d.ts', 'client.ts'];
const CLIENT_DEPTH = 2;
const CLIENT_PROVIDERS = new Set<string | undefined>(['prisma-client-js', 'prisma-client']);
const GENERATOR = /generator\s+\w+\s*\{([^}]*)\}/gu;
const PROVIDER = /provider\s*=\s*"([^"]+)"/u;
const OUTPUT = /output\s*=\s*"([^"]+)"/u;

const schemaOutputs: Cache<string[]> = new Map();
const splitSchemas: Cache<string[]> = new Map();

function childPath(directory: string, name: string): string | undefined {
  const base = path.resolve(directory);
  const child = path.resolve(base, name);
  if (!child.startsWith(`${base}${path.sep}`)) {
    return undefined;
  }
  return child;
}

function generatorOutputs(file: string): string[] {
  const outputs: string[] = [];
  for (const [, body = ''] of readFileSync(file, 'utf8').matchAll(GENERATOR)) {
    const provider = PROVIDER.exec(body)?.[1];
    const output = OUTPUT.exec(body)?.[1];
    if (CLIENT_PROVIDERS.has(provider) && output !== undefined) {
      outputs.push(path.resolve(path.dirname(file), output));
    }
  }
  return outputs;
}

function prismaFilesIn(folder: string): string[] {
  return readdirSync(folder)
    .filter((name) => name.endsWith('.prisma'))
    .map((name) => path.join(folder, name));
}

function schemaFiles(directory: string): string[] {
  const folder = childPath(directory, SCHEMA_FOLDER);
  const split = folder === undefined ? undefined : readStamped(splitSchemas, folder, prismaFilesIn);
  const single = SCHEMA_FILES.map((name) => childPath(directory, name));
  return [...single, ...(split ?? [])].filter((file) => file !== undefined);
}

function outputsOf(directory: string): string[] {
  return schemaFiles(directory).flatMap(
    (file) => readStamped(schemaOutputs, file, generatorOutputs) ?? [],
  );
}

function hasChild(directory: string, name: string): boolean {
  const file = childPath(directory, name);
  return file !== undefined && existsSync(file);
}

function isClientDirectory(directory: string): boolean {
  return hasChild(directory, SCHEMA) && CLIENT_ENTRIES.some((name) => hasChild(directory, name));
}

function ancestors(fileName: string): string[] {
  const parts = path.dirname(fileName).split(path.sep);
  return parts.map((_, index) => parts.slice(0, index + 1).join(path.sep) || path.sep).reverse();
}

export function isGeneratedPrismaClient(fileName: string): boolean {
  const directories = ancestors(path.resolve(fileName));
  return (
    directories.slice(0, CLIENT_DEPTH).some((directory) => isClientDirectory(directory)) ||
    directories.some((directory) =>
      outputsOf(directory).some((output) => isStrictlyInside(output, fileName)),
    )
  );
}
