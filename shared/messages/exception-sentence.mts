import { fieldOf } from '../values/readers.mts';

export type ExceptionEntryShape = object;
export type RouteFields = { exception?: ExceptionEntryShape; exceptionList?: string | undefined };

const PLACEHOLDER_REASON = '...';

export const WORD_CHARACTER = /[\p{L}\p{N}]/u;

export function isPlaceholderReason(reason: string): boolean {
  return !WORD_CHARACTER.test(reason);
}

const GLOB_CHARACTERS = /[{}[\],*?\\]/gu;

export function escapeGlob(path: string): string {
  return path.replaceAll(GLOB_CHARACTERS, (character) => `\\${character}`);
}

export type ExceptionEntryParts = {
  readonly rule: string;
  readonly path?: string | undefined;
  readonly glob?: string | undefined;
  readonly function?: string | undefined;
  readonly name?: string | undefined;
  readonly packages?: readonly string[] | undefined;
};

export function exceptionEntryText({
  rule,
  path,
  glob,
  function: functionName,
  name,
  packages,
}: ExceptionEntryParts): string {
  return JSON.stringify({
    rule,
    paths: [glob ?? escapeGlob(path ?? '')],
    ...(packages === undefined ? {} : { packages }),
    ...(functionName === undefined ? {} : { function: functionName }),
    ...(name === undefined ? {} : { name }),
    reason: PLACEHOLDER_REASON,
  });
}

export function exceptionSentence(entryText: string, key = 'exceptions'): string {
  return `If this is intended, add ${entryText} to "${key}" in nitpicker.config.json.`;
}

export const ROUTE_SENTENCE =
  /If this is intended, add (?<entry>\{.*\}) to "(?<list>(?:python\.)?exceptions)" in nitpicker\.config\.json\.$/su;

export function hasExceptionRoute(message: string): boolean {
  return ROUTE_SENTENCE.test(message);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && !value.includes('\0');
}

export function isExceptionEntry(value: unknown): value is ExceptionEntryShape {
  const paths = fieldOf(value, 'paths');
  return (
    typeof value === 'object' &&
    value !== null &&
    isNonEmptyText(fieldOf(value, 'rule')) &&
    isNonEmptyText(fieldOf(value, 'reason')) &&
    Array.isArray(paths) &&
    paths.length > 0 &&
    paths.every(isNonEmptyText)
  );
}

function parsedEntry(text: string): ExceptionEntryShape | undefined {
  const parsed = parsedJson(text);
  return parsed.kind === 'parsed' && isExceptionEntry(parsed.value) ? parsed.value : undefined;
}

function parsedJson(
  text: string,
): { kind: 'parsed'; value: unknown } | { kind: 'malformed-json'; error: unknown } {
  try {
    return { kind: 'parsed', value: JSON.parse(text) };
  } catch (error) {
    return { kind: 'malformed-json', error };
  }
}

export function routeFields(message: string): RouteFields {
  const route = ROUTE_SENTENCE.exec(message);
  const exception = route === null ? undefined : parsedEntry(route.groups?.['entry'] ?? '');
  return exception === undefined || route === null
    ? {}
    : { exception, exceptionList: route.groups?.['list'] };
}

export function withoutExceptionRoute(message: string): string {
  return message.replace(ROUTE_SENTENCE, '').trim();
}

export function insertBeforeRoute(message: string, text: string): string {
  const route = ROUTE_SENTENCE.exec(message);
  return route === null
    ? `${message} ${text}`
    : `${message.slice(0, route.index)}${text} ${route[0]}`;
}

export function appendSentence(message: string, sentence: string | undefined): string {
  if (sentence === undefined) {
    return message;
  }
  return `${message.replace(/\.?\s*$/, '')}. ${sentence}`;
}

const FOLDER_SUFFIXES = ['', '/**', '/*'];

function pathWithSuffix(path: string, suffix: string): string {
  if (path !== '.') {
    return `${escapeGlob(path)}${suffix}`;
  }
  return suffix === '' ? path : suffix.slice(1);
}

export function retargetSentence(message: string, fromPath: string, toPath: string): string {
  return FOLDER_SUFFIXES.reduce(
    (text: string, suffix: string) =>
      text.replaceAll(
        `"paths":[${JSON.stringify(pathWithSuffix(fromPath, suffix))}]`,
        () => `"paths":[${JSON.stringify(pathWithSuffix(toPath, suffix))}]`,
      ),
    message,
  );
}
