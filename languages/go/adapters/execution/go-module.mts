import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { appendAll } from '../../../../shared/lists/lists.mts';

export const GO_MOD = 'go.mod';
const COMMENT = /\/\/.*$/u;
const BLOCK_START = /^(\w+)\s*\($/u;
const DIRECTIVE = /^(\w+)\s+(\S.*)$/u;

type Entry = readonly [string, string];
type GoMod = {
  module: string | undefined;
  goVersion: string | undefined;
  tools: string[];
  requires: string[];
};

function entryOf(block: string | undefined, line: string): Entry | undefined {
  if (block !== undefined) {
    return line === ')' ? undefined : [block, line];
  }
  if (BLOCK_START.test(line)) {
    return undefined;
  }
  const [, name, value] = DIRECTIVE.exec(line) ?? [];
  return name === undefined || value === undefined ? undefined : [name, value];
}

function nextBlock(block: string | undefined, line: string): string | undefined {
  if (block !== undefined) {
    return line === ')' ? undefined : block;
  }
  return BLOCK_START.exec(line)?.[1];
}

function directives(text: string): Entry[] {
  const entries: Entry[] = [];
  let block: string | undefined;
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.replace(COMMENT, '').trim();
    const entry = line === '' ? undefined : entryOf(block, line);
    appendAll(entries, entry === undefined ? [] : [entry]);
    block = line === '' ? block : nextBlock(block, line);
  }
  return entries;
}

function unquoted(value: string) {
  return value.replace(/^"(.*)"$/u, '$1');
}

function firstValue(entries: readonly Entry[], name: string) {
  return entries.find(([key]) => key === name)?.[1];
}

export function parseGoMod(text: string): GoMod {
  const entries = directives(text);
  const module = firstValue(entries, 'module');
  return {
    module: module === undefined ? undefined : unquoted(module),
    goVersion: firstValue(entries, 'go'),
    tools: entries.filter(([key]) => key === 'tool').map(([, value]) => unquoted(value)),
    requires: entries
      .filter(([key]) => key === 'require')
      .map(([, value]) => unquoted(value.split(/\s+/u)[0] ?? value)),
  };
}

export function readGoModule(projectRoot: string): GoMod | undefined {
  const file = path.join(projectRoot, GO_MOD);
  return existsSync(file) ? parseGoMod(readFileSync(file, 'utf8')) : undefined;
}

export function moduleFileText(root: string | undefined, file: string): string | undefined {
  const absolute = pathInside(root, file);
  return absolute !== undefined && existsSync(absolute) && statSync(absolute).isFile()
    ? readFileSync(absolute, 'utf8')
    : undefined;
}
