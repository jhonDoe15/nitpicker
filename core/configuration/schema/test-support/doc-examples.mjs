import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../../../tooling/tool-resolution.mjs';
import { SCHEMA_KEY } from '../../../../shared/config.mjs';
import { KEYS } from '../../validate.mjs';

const FENCE = /^\s*```/u;
const INLINE_CODE = /`(\{[^`]*\})`/gu;

function packagePath(relative) {
  const full = path.resolve(PACKAGE_ROOT, relative);
  if (!full.startsWith(PACKAGE_ROOT + path.sep)) {
    throw new Error(`${relative} is outside the package`);
  }
  return full;
}

function markdownFiles() {
  const directories = ['docs', 'skills'].flatMap((directory) =>
    readdirSync(packagePath(directory), { recursive: true }).map((file) =>
      path.join(directory, file),
    ),
  );
  return ['README.md', ...directories].filter((file) => file.endsWith('.md'));
}

function fencedBlocks(text) {
  const blocks = [];
  let current;
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

function parsedJson(text) {
  try {
    return { kind: 'parsed', value: JSON.parse(text) };
  } catch (error) {
    return { kind: 'malformed-json', error };
  }
}

function parsedConfig(text) {
  const parsed = parsedJson(text);
  const { value } = parsed;
  const keys =
    parsed.kind === 'parsed' && typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.keys(value)
      : [];
  return keys.length > 0 && keys.every((key) => [...KEYS, SCHEMA_KEY].includes(key))
    ? value
    : undefined;
}

export function documentedConfigs() {
  return markdownFiles().flatMap((file) => {
    const text = readFileSync(packagePath(file), 'utf8');
    const candidates = [
      ...fencedBlocks(text),
      ...[...text.matchAll(INLINE_CODE)].map((match) => match[1]),
    ];
    return candidates.flatMap((candidate) => {
      const config = parsedConfig(candidate);
      return config === undefined ? [] : [{ file, text: candidate, config }];
    });
  });
}
