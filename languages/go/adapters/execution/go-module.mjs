import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../../../shared/filesystem.mjs';

const GO_MOD = 'go.mod';
const COMMENT = /\/\/.*$/u;
const BLOCK_START = /^(\w+)\s*\($/u;
const DIRECTIVE = /^(\w+)\s+(\S.*)$/u;

function entryOf(block, line) {
  if (block !== undefined) {
    return line === ')' ? undefined : [block, line];
  }
  if (BLOCK_START.test(line)) {
    return undefined;
  }
  const directive = DIRECTIVE.exec(line);
  return directive === null ? undefined : [directive[1], directive[2]];
}

function nextBlock(block, line) {
  if (block !== undefined) {
    return line === ')' ? undefined : block;
  }
  return BLOCK_START.exec(line)?.[1];
}

function directives(text) {
  const entries = [];
  let block;
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.replace(COMMENT, '').trim();
    const entry = line === '' ? undefined : entryOf(block, line);
    entries.push(...(entry === undefined ? [] : [entry]));
    block = line === '' ? block : nextBlock(block, line);
  }
  return entries;
}

function unquoted(value) {
  return value.replace(/^"(.*)"$/u, '$1');
}

function firstValue(entries, name) {
  return entries.find(([key]) => key === name)?.[1];
}

export function parseGoMod(text) {
  const entries = directives(text);
  const module = firstValue(entries, 'module');
  return {
    module: module === undefined ? undefined : unquoted(module),
    goVersion: firstValue(entries, 'go'),
    tools: entries.filter(([key]) => key === 'tool').map(([, value]) => unquoted(value)),
    requires: entries
      .filter(([key]) => key === 'require')
      .map(([, value]) => unquoted(value.split(/\s+/u)[0])),
  };
}

export function readGoModule(projectRoot) {
  const file = path.join(projectRoot, GO_MOD);
  return existsSync(file) ? parseGoMod(readFileSync(file, 'utf8')) : undefined;
}

export function moduleFileText(root, file) {
  const absolute = pathInside(root, file);
  return absolute !== undefined && existsSync(absolute)
    ? readFileSync(absolute, 'utf8')
    : undefined;
}
