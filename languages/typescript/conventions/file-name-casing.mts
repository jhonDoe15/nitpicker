import { hasField } from '../../../shared/values/readers.mts';
import { escapeRegExp as untypedEscapeRegExp } from '../../../shared/paths/glob.mts';
import { FIXTURE_PATH } from '../preset/layout.mts';

const escapeRegExp: (text: string) => string = untypedEscapeRegExp;

const SOURCE_FILES = ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const FRAMEWORK_PREFIX = /^[_+$@(#~]/;
const ROUTE_SYNTAX = /[[\]]|_$/;
const GENERATED_NAME = /\.(?:graphql|gql)\.[^/]+$/;
const HOOK_NAME = /^use[A-Z]/;
const PASCAL_CASE = /^[A-Z][a-zA-Z0-9]*$/;
const LOCALE_CODE = /^(?:[a-z]{2,3}[-_][A-Z]{2}|[a-z]{2}[-_][a-z]{2})$/;
const GENERATED_SEGMENT = /^(?=.*\d)[a-z0-9]{8,}$/;
const RESERVED_BASES = new Set([
  'not-found',
  'global-error',
  'opengraph-image',
  'twitter-image',
  'apple-icon',
]);
const MIN_FOLDER_VOTES = 3;

const CASING_PATTERNS: Readonly<Record<string, RegExp>> = {
  'kebab-case': /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  camelCase: /^[a-z0-9][a-zA-Z0-9]*$/,
  snake_case: /^[a-z0-9]+(?:_[a-z0-9]+)*$/,
};

export const FILE_NAME_CASINGS = Object.keys(CASING_PATTERNS);

export const FILE_NAME_CONVENTION = {
  id: 'typescript.fileNames',
  label: 'File names',
  options: FILE_NAME_CASINGS,
  optionLabels: Object.fromEntries(FILE_NAME_CASINGS.map((casing) => [casing, casing])),
  fallback: 'kebab-case',
  files: SOURCE_FILES,
  nameOnly: true,
  needsText: (file: string): boolean => HOOK_NAME.test(fileNameParts(file).base),
  scope: 'layout',
  measure: fileNameVote,
};

export function fileNameRuleOptions({
  conventions = {},
  conventionPins = {},
}: {
  readonly conventions?: Readonly<Record<string, unknown>>;
  readonly conventionPins?: Readonly<Record<string, unknown>>;
} = {}): { readonly casing: unknown; readonly pinned?: true } {
  return {
    casing: conventions[FILE_NAME_CONVENTION.id] ?? FILE_NAME_CONVENTION.fallback,
    ...(hasField(conventionPins, FILE_NAME_CONVENTION.id) ? { pinned: true } : {}),
  };
}

export function fileNameParts(file: string): {
  readonly name: string;
  readonly base: string;
  readonly stem: string[];
} {
  const name = file.split(/[\\/]/).pop() ?? '';
  const segments = name.split('.');
  return { name, base: segments[0] ?? '', stem: segments.slice(0, -1) };
}

export function fittingCasings(base: string): string[] {
  return Object.entries(CASING_PATTERNS)
    .filter(([, pattern]) => pattern.test(base))
    .map(([casing]) => casing);
}

function isGeneratedSegment(segment: string): boolean {
  return segment.split(/[-_]/).some((part) => GENERATED_SEGMENT.test(part));
}

function isExemptPath(file: string): boolean {
  const posix = file.replaceAll('\\', '/');
  return GENERATED_NAME.test(posix) || FIXTURE_PATH.test(posix);
}

function exportsName(text: string, hookName: string): boolean {
  const name = escapeRegExp(hookName);
  const code = text.replaceAll(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const declaration = new RegExp(
    `\\bexport\\s+(?:default\\s+)?(?:(?:async\\s+)?function\\s*\\*?\\s*|(?:const|let|var)\\s+)${name}\\b`,
  );
  const listed = new RegExp(`\\bexport\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`);
  const defaulted = new RegExp(`\\bexport\\s+default\\s+${name}\\b`);
  return declaration.test(code) || listed.test(code) || defaulted.test(code);
}

function isHookFile(base: string, text: string | undefined): boolean {
  return HOOK_NAME.test(base) && (text === undefined || exportsName(text, base));
}

function isExemptName(file: string, text: string | undefined): boolean {
  const { base, stem } = fileNameParts(file);
  return (
    base === '' ||
    FRAMEWORK_PREFIX.test(base) ||
    ROUTE_SYNTAX.test(base) ||
    RESERVED_BASES.has(base) ||
    stem.slice(1).includes('config') ||
    PASCAL_CASE.test(base) ||
    isHookFile(base, text) ||
    LOCALE_CODE.test(base) ||
    stem.some(isGeneratedSegment)
  );
}

export function fileNameComplies(
  file: string,
  casing: string | undefined,
  text: string | undefined,
): boolean {
  return (
    isExemptPath(file) ||
    isExemptName(file, text) ||
    fittingCasings(fileNameParts(file).base).some((fitting) => fitting === casing)
  );
}

function fileNameVote(text: string | undefined, file: string | undefined): string | undefined {
  if (file === undefined || isExemptPath(file) || isExemptName(file, text)) {
    return undefined;
  }
  const fitting = fittingCasings(fileNameParts(file).base);
  return fitting.length === 1 ? fitting[0] : undefined;
}

export function folderCasing(file: string, siblingNames: readonly string[]): string | undefined {
  const own = fileNameParts(file).name;
  const votes = siblingNames
    .filter((name) => name !== own && SOURCE_FILE.test(name))
    .map((name) => fileNameVote(undefined, name))
    .filter((vote): vote is string => vote !== undefined);
  if (votes.length < MIN_FOLDER_VOTES) {
    return undefined;
  }
  const counts = FILE_NAME_CASINGS.map((casing): [string, number] => [
    casing,
    votes.filter((vote) => vote === casing).length,
  ]).sort(([, left], [, right]) => right - left);
  const [first, second] = counts;
  return first !== undefined && second !== undefined && first[1] > second[1] ? first[0] : undefined;
}
