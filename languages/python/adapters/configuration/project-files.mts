import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseTomlText } from '../project-tools/typed/toml-module.mts';
import { fieldOf, messageOf, textOf } from '../../../../shared/values/readers.mts';

export type TomlTable = { readonly [key: string]: unknown };

export type TomlParse =
  | { readonly kind: 'table'; readonly table: TomlTable }
  | { readonly kind: 'invalid'; readonly error: unknown };

export function isTable(value: unknown): value is TomlTable {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function insideRoot(projectRoot: string, name: string): string | undefined {
  const root = path.resolve(projectRoot);
  const full = path.resolve(root, name);
  return full === root || full.startsWith(root + path.sep) ? full : undefined;
}

export function readProjectFile(projectRoot: string, name: string): string | undefined {
  const full = insideRoot(projectRoot, name);
  if (full === undefined || !existsSync(full)) {
    return undefined;
  }
  try {
    return readFileSync(full, 'utf8');
  } catch (error) {
    throw new Error(
      `${name} could not be read (${textOf(fieldOf(error, 'code') ?? messageOf(error))}): fix or remove it`,
      {
        cause: error,
      },
    );
  }
}

export function parseToml(text: string): TomlParse {
  try {
    const table = parseTomlText(text);
    return isTable(table) ? { kind: 'table', table } : { kind: 'invalid', error: table };
  } catch (error) {
    return { kind: 'invalid', error };
  }
}

export function tomlTable(projectRoot: string, name: string): TomlTable | undefined {
  const text = readProjectFile(projectRoot, name);
  const parsed = text === undefined ? undefined : parseToml(text);
  return parsed?.kind === 'table' ? parsed.table : undefined;
}
