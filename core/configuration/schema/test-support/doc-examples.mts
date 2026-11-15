import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../../../tooling/tool-resolution.mjs';
import { SCHEMA_KEY } from '../../../../shared/config.mjs';
import { KEYS } from '../../validate.mts';
import { isPlainObject } from '../../views/config-views.mts';
import { parseJson } from '../../../../shared/values/readers.mts';

type DocumentedConfig = {
  readonly file: string;
  readonly text: string;
  readonly config: Record<string, unknown>;
};

type ParsedJson =
  | { readonly kind: 'parsed'; readonly value: unknown }
  | { readonly kind: 'malformed-json'; readonly value: undefined; readonly error: unknown };

const FENCE = /^\s*```/u;
const INLINE_CODE = /`(\{[^`]*\})`/gu;

function packagePath(relative: string): string {
  const full = path.resolve(PACKAGE_ROOT, relative);
  if (!full.startsWith(PACKAGE_ROOT + path.sep)) {
    throw new Error(`${relative} is outside the package`);
  }
  return full;
}

function markdownFiles(): string[] {
  const directories = ['docs', 'skills'].flatMap((directory) =>
    readdirSync(packagePath(directory), { recursive: true, encoding: 'utf8' }).map((file) =>
      path.join(directory, file),
    ),
  );
  return ['README.md', ...directories].filter((file) => file.endsWith('.md'));
}

function fencedBlocks(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] | undefined;
  for (const line of text.split('\n')) {
    if (!FENCE.test(line)) {
      current?.push(line);
    } else if (current === undefined) {
      current = [];
    } else {
      blocks.push(current.join('\n'));
      current = undefined;
    }
  }
  return blocks;
}

function parsedJson(text: string): ParsedJson {
  try {
    return { kind: 'parsed', value: parseJson(text) };
  } catch (error) {
    return { kind: 'malformed-json', value: undefined, error };
  }
}

function parsedConfig(text: string): Record<string, unknown> | undefined {
  const parsed = parsedJson(text);
  const { value } = parsed;
  const keys = parsed.kind === 'parsed' && isPlainObject(value) ? Object.keys(value) : [];
  return isPlainObject(value) &&
    keys.length > 0 &&
    keys.every((key) => [...KEYS, SCHEMA_KEY].includes(key))
    ? value
    : undefined;
}

export function documentedConfigs(): DocumentedConfig[] {
  return markdownFiles().flatMap((file) => {
    const text = readFileSync(packagePath(file), 'utf8');
    const candidates = [
      ...fencedBlocks(text),
      ...[...text.matchAll(INLINE_CODE)].map((match) => match[1] ?? ''),
    ];
    return candidates.flatMap((candidate) => {
      const config = parsedConfig(candidate);
      return config === undefined ? [] : [{ file, text: candidate, config }];
    });
  });
}
