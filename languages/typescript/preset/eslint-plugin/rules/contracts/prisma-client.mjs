import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA = 'schema.prisma';
const SCHEMA_FOLDER = path.join('prisma', 'schema');
const CLIENT_ENTRIES = ['index.d.ts', 'client.d.ts', 'client.ts'];
const CLIENT_DEPTH = 2;
const CLIENT_PROVIDERS = new Set(['prisma-client-js', 'prisma-client']);
const GENERATOR = /generator\s+\w+\s*\{([^}]*)\}/gu;
const PROVIDER = /provider\s*=\s*"([^"]+)"/u;
const OUTPUT = /output\s*=\s*"([^"]+)"/u;

const outputsByDirectory = new Map();
const clientDirectories = new Map();

function schemaFiles(directory) {
  const folder = path.join(directory, SCHEMA_FOLDER);
  const split = existsSync(folder)
    ? readdirSync(folder)
        .filter((name) => name.endsWith('.prisma'))
        .map((name) => path.join(folder, name))
    : [];
  return [path.join(directory, 'prisma', SCHEMA), path.join(directory, SCHEMA), ...split].filter(
    (file) => existsSync(file),
  );
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

function outputsOf(directory) {
  if (!outputsByDirectory.has(directory)) {
    outputsByDirectory.set(directory, schemaFiles(directory).flatMap(generatorOutputs));
  }
  return outputsByDirectory.get(directory);
}

function isClientDirectory(directory) {
  if (!clientDirectories.has(directory)) {
    const generated =
      existsSync(path.join(directory, SCHEMA)) &&
      CLIENT_ENTRIES.some((entry) => existsSync(path.join(directory, entry)));
    clientDirectories.set(directory, generated);
  }
  return clientDirectories.get(directory);
}

function ancestors(fileName) {
  const found = [];
  for (let directory = path.dirname(fileName); ; directory = path.dirname(directory)) {
    found.push(directory);
    if (path.dirname(directory) === directory) {
      return found;
    }
  }
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
