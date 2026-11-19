import { existsSync, readFileSync } from 'node:fs';
import { escapeRegExp } from '../typed/regex-escape.mts';
import { resolveInside as untypedResolveInside } from '../../../../shared/conventions/read-inside.mjs';
import type { Locate } from './typed/locate-type.mts';

const resolveInside: (root: string, relative: string) => string | undefined = untypedResolveInside;

type SourceContext = { readonly locate: Locate; readonly projectRoot: string };
type TypeSource = { readonly relative: string; readonly file: string };

const SPRING_BOOT_TEST = /@SpringBootTest\b/u;
const PACKAGE = /^\s*package\s+([\w.]+)/mu;
const SUPERTYPE =
  /\bclass\s+\w+(?:<[^{]*?>)?\s+extends\s+([\w.]+)|\bclass\s+\w+(?=[^\w{])[^{]*?:\s*([\w.]+)\s*\(/gu;
const ANNOTATION = /@([A-Z][\w.]*)/gu;
const MAX_TYPES = 50;
const UNIT_TEST_TASKS = new Set(['test', 'surefire']);
const INTEGRATION_CLASS = /(?:IT|ITCase|IntegrationTests?|IntegrationSpec|ISpec)$/u;
const INTEGRATION_SEGMENTS = new Set(['integration', 'it', 'e2e']);

export function isUnitTestTask(task: string): boolean {
  return UNIT_TEST_TASKS.has(task);
}

export function isIntegrationTest({
  className,
  unitSource,
}: {
  className: string;
  unitSource: boolean;
}): boolean {
  const segments = className.split('.');
  const simple = (segments.pop() ?? '').split('$')[0] ?? '';
  return (
    !unitSource ||
    INTEGRATION_CLASS.test(simple) ||
    segments.some((segment) => INTEGRATION_SEGMENTS.has(segment))
  );
}

function referencedTypes(text: string): string[] {
  return [
    ...[...text.matchAll(SUPERTYPE)].map((match) => match[1] ?? match[2]),
    ...[...text.matchAll(ANNOTATION)].map((match) => match[1]),
  ].filter((name) => name !== undefined);
}

export function qualifiedName(text: string, name: string): string {
  if (name.includes('.')) {
    return name;
  }
  const imported = new RegExp(
    String.raw`^\s*import\s+([\w.]+\.${escapeRegExp(name)})\s*;?\s*$`,
    'mu',
  ).exec(text);
  const importedName = imported?.[1];
  if (importedName !== undefined) {
    return importedName;
  }
  const owner = PACKAGE.exec(text)?.[1];
  return owner === undefined ? name : `${owner}.${name}`;
}

function typeSource(locate: Locate, directory: string, simple: string): string | undefined {
  return (
    locate(directory, `${simple}.java`) ??
    locate(directory, `${simple}.kt`) ??
    locate(directory, `${simple}.groovy`)
  );
}

export function sourceOfType(
  locate: Locate,
  projectRoot: string,
  qualified: string,
): TypeSource | undefined {
  const parts = qualified.split('.');
  const simple = parts.pop() ?? '';
  const directory = parts.join('/');
  const relative = typeSource(locate, directory, simple);
  if (relative === undefined) {
    return undefined;
  }
  const file = resolveInside(projectRoot, relative);
  return file !== undefined && existsSync(file) ? { relative, file } : undefined;
}

function referencedSources(text: string, { locate, projectRoot }: SourceContext): TypeSource[] {
  return referencedTypes(text)
    .map((name) => sourceOfType(locate, projectRoot, qualifiedName(text, name)))
    .filter((source) => source !== undefined);
}

export function isSpringBootTest(text: string, context: SourceContext): boolean {
  const pending = [text];
  const seen = new Set<string>();
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

export function sourceOf(locate: Locate, className: string): string | undefined {
  const parts = className.split('.');
  const simple = (parts.pop() ?? '').split('$')[0] ?? '';
  const directory = parts.join('/');
  return typeSource(locate, directory, simple);
}
