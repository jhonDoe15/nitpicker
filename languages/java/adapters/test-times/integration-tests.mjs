import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SPRING_BOOT_TEST = /@SpringBootTest\b/u;
const PACKAGE = /^\s*package\s+([\w.]+)/mu;
const SUPERTYPE =
  /\bclass\s+\w+(?:<[^{]*?>)?\s+extends\s+([\w.]+)|\bclass\s+\w+(?=[^\w{])[^{]*?:\s*([\w.]+)\s*\(/gu;
const ANNOTATION = /@([A-Z][\w.]*)/gu;
const MAX_TYPES = 50;
const UNIT_TEST_TASKS = new Set(['test', 'surefire']);
const INTEGRATION_CLASS = /(?:IT|ITCase|IntegrationTests?|IntegrationSpec|ISpec)$/u;
const INTEGRATION_SEGMENTS = new Set(['integration', 'it', 'e2e']);

export function isUnitTestTask(task) {
  return UNIT_TEST_TASKS.has(task);
}

export function isIntegrationTest({ className, unitSource }) {
  const segments = className.split('.');
  const simple = segments.pop().split('$')[0];
  return (
    !unitSource ||
    INTEGRATION_CLASS.test(simple) ||
    segments.some((segment) => INTEGRATION_SEGMENTS.has(segment))
  );
}

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

function typeSource(locate, directory, simple) {
  return (
    locate(directory, `${simple}.java`) ??
    locate(directory, `${simple}.kt`) ??
    locate(directory, `${simple}.groovy`)
  );
}

export function sourceOfType(locate, projectRoot, qualified) {
  const parts = qualified.split('.');
  const simple = parts.pop();
  const directory = parts.join('/');
  const relative = typeSource(locate, directory, simple);
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

export function sourceOf(locate, className) {
  const parts = className.split('.');
  const simple = parts.pop().split('$')[0];
  const directory = parts.join('/');
  return typeSource(locate, directory, simple);
}
