import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SPRING_BOOT_TEST = /@SpringBootTest\b/u;
const PACKAGE = /^\s*package\s+([\w.]+)/mu;
const SUPERTYPE =
  /\bclass\s+\w+(?:<[^{]*?>)?\s+extends\s+([\w.]+)|\bclass\s+\w+(?=[^\w{])[^{]*?:\s*([\w.]+)\s*\(/gu;
const ANNOTATION = /@([A-Z][\w.]*)/gu;
const MAX_TYPES = 50;

function referencedTypes(text) {
  return [
    ...[...text.matchAll(SUPERTYPE)].map((match) => match[1] ?? match[2]),
    ...[...text.matchAll(ANNOTATION)].map((match) => match[1]),
  ];
}

export function qualifiedName(text, name) {
  if (name.includes('.')) {
    return name;
  }
  const imported = new RegExp(String.raw`^\s*import\s+([\w.]+\.${name})\s*;?\s*$`, 'mu').exec(text);
  if (imported !== null) {
    return imported[1];
  }
  const owner = PACKAGE.exec(text)?.[1];
  return owner === undefined ? name : `${owner}.${name}`;
}

export function sourceOfType(locate, projectRoot, qualified) {
  const parts = qualified.split('.');
  const simple = parts.pop();
  const directory = parts.join('/');
  const relative = locate(directory, `${simple}.java`) ?? locate(directory, `${simple}.kt`);
  const file = relative === undefined ? undefined : path.join(projectRoot, relative);
  return file !== undefined && existsSync(file) ? { relative, file } : undefined;
}

function referencedSources(text, { locate, projectRoot }) {
  return referencedTypes(text)
    .map((name) => sourceOfType(locate, projectRoot, qualifiedName(text, name)))
    .filter((source) => source !== undefined);
}

export function isSpringBootTest(text, context) {
  const pending = [text];
  const seen = new Set();
  for (const current of pending) {
    if (SPRING_BOOT_TEST.test(current)) {
      return true;
    }
    const fresh = new Map(
      referencedSources(current, context)
        .filter((source) => !seen.has(source.relative))
        .map((source) => [source.relative, source.file]),
    );
    for (const [relative, file] of [...fresh].slice(0, Math.max(0, MAX_TYPES - seen.size))) {
      seen.add(relative);
      pending.push(readFileSync(file, 'utf8'));
    }
  }
  return false;
}
