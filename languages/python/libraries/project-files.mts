import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';
import type { TomlModule } from './typed/dependency-types.mts';

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16_LE_BOM = [0xff, 0xfe];
const UTF16_BE_BOM = [0xfe, 0xff];

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  return bytes.every((byte, index) => buffer[index] === byte);
}

function decodeText(buffer: Buffer): string {
  if (startsWith(buffer, UTF8_BOM)) {
    return buffer.subarray(UTF8_BOM.length).toString('utf8');
  }
  if (startsWith(buffer, UTF16_LE_BOM)) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(UTF16_LE_BOM.length));
  }
  if (startsWith(buffer, UTF16_BE_BOM)) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(UTF16_BE_BOM.length));
  }
  if (buffer[1] === 0 && (buffer[0] ?? 0) > 0) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  if (buffer[0] === 0 && (buffer[1] ?? 0) > 0) {
    return new TextDecoder('utf-16be').decode(buffer);
  }
  return buffer.toString('utf8');
}

export function readProjectText(file: string): string {
  return decodeText(readFileSync(file));
}

export function toml(): TomlModule {
  const module: unknown = createRequire(import.meta.url)('smol-toml');
  const parse = fieldOf(module, 'parse');
  const stringify = fieldOf(module, 'stringify');
  if (typeof parse !== 'function' || typeof stringify !== 'function') {
    throw new TypeError('smol-toml has no parse or stringify');
  }
  return {
    parse: (text: string) => {
      const parsed: unknown = Reflect.apply(parse, module, [text]);
      return parsed;
    },
    stringify: (value: unknown) => textOf(Reflect.apply(stringify, module, [value])),
  };
}

export function isDirectory(directory: string): boolean {
  return existsSync(directory) && statSync(directory).isDirectory();
}

export function insideProject(projectRoot: string, file: string): string {
  const root = path.resolve(projectRoot);
  const full = path.resolve(root, file);
  if (full === root) {
    return root;
  }
  if (!full.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${file} is outside the project at ${projectRoot}`);
  }
  return full;
}

export function readProjectFile(projectRoot: string, file: string): string | undefined {
  const full = insideProject(projectRoot, file);
  return existsSync(full) ? readProjectText(full) : undefined;
}
