import { readFileSync } from 'node:fs';
import path from 'node:path';
import FACTS from '../../../gradle/errorprone/option-facts.json' with { type: 'json' };
import { encodingOf, projectFlags } from '../engine-arguments.mts';
import { GLOBAL_FLAGS, levelFlag, type CheckLevels } from './check-levels.mts';

const OPTION = '-XepOpt:';
const EXCLUDED_PATHS = '-XepExcludedPaths:';
const QUIET_GENERATED = '-XepDisableWarningsInGeneratedCode';
const IGNORE_UNKNOWN = '-XepIgnoreUnknownCheckNames';
const LEVEL_PREFIX = '-Xep:';
const NULL_AWAY_OPTION = 'NullAway:';
const NULL_AWAY_READERS = ['NullAway', ...FACTS.pluginChecks];
const READERS: Readonly<Record<string, readonly string[]>> = FACTS.flagReaders;
const PLAIN_PATTERN = /^(?:[\w/.*+?|()[\]{},^$:=!~@#%&'"<>-]|\\[.\\/()[\]{}*+?|^$dDwW-])*$/u;
const NOT_IN_SCRIPT = /\(\?(?![:=!])|[*+?}]\+|&&|\[\[/u;
const GENERATED_WORD = /\bGenerated\b/u;
const WIDE_ENCODING = /^(?:utf-?(?:16|32)|unicode|x-utf-?(?:16|32))/iu;
const SKIP_GENERATED = '--skip-generated';
const OUTPUT_FOLDER = '-s';

function optionKey(flag: string): string {
  const body = flag.slice(OPTION.length);
  const equals = body.indexOf('=');
  return equals === -1 ? body : body.slice(0, equals);
}

function readersOf(key: string): readonly string[] | undefined {
  if (key.startsWith(NULL_AWAY_OPTION)) {
    return NULL_AWAY_READERS;
  }
  return Object.hasOwn(READERS, key) ? READERS[key] : undefined;
}

function scriptPattern(pattern: string): RegExp | undefined {
  if (!PLAIN_PATTERN.test(pattern) || NOT_IN_SCRIPT.test(pattern)) {
    return undefined;
  }
  try {
    return new RegExp(`^(?:${pattern})$`, 'u');
  } catch {
    return undefined;
  }
}

function excludedPatterns(flags: readonly string[]): string[] {
  return flags
    .filter((flag) => flag.startsWith(EXCLUDED_PATHS))
    .map((flag) => flag.slice(EXCLUDED_PATHS.length));
}

function supported(flag: string): boolean {
  if (flag.startsWith(OPTION)) {
    return readersOf(optionKey(flag)) !== undefined;
  }
  if (flag.startsWith(EXCLUDED_PATHS)) {
    return scriptPattern(flag.slice(EXCLUDED_PATHS.length)) !== undefined;
  }
  if (flag.startsWith(LEVEL_PREFIX)) {
    return levelFlag(flag) !== undefined;
  }
  return [...GLOBAL_FLAGS, QUIET_GENERATED, IGNORE_UNKNOWN].includes(flag);
}

/** The first project Error Prone option the engine cannot follow, if any. */
export function unsupportedOption(head: readonly string[]): string | undefined {
  return projectFlags(head).find((flag) => !supported(flag));
}

/** The checks that read an option the project sets with `-XepOpt:`; the engine does not take those options. */
export function optionReaders(head: readonly string[]): ReadonlySet<string> {
  return new Set(
    projectFlags(head)
      .filter((flag) => flag.startsWith(OPTION))
      .flatMap((flag) => readersOf(optionKey(flag)) ?? []),
  );
}

function errorProneName(file: string): string {
  const slashed = path.resolve(file).split(path.sep).join('/');
  return slashed.startsWith('/') ? slashed : `/${slashed}`;
}

/**
 * Whether Error Prone leaves the file out for the project's `-XepExcludedPaths`. Error Prone keeps the last pattern;
 * the runner joins every pattern when it adds its own for generated sources.
 */
export function excludedFile(head: readonly string[]): (file: string) => boolean {
  const patterns = excludedPatterns(projectFlags(head)).flatMap(
    (pattern) => scriptPattern(pattern) ?? [],
  );
  const joined = head.includes(SKIP_GENERATED) || head.includes(OUTPUT_FOLDER);
  const used = joined ? patterns : patterns.slice(-1);
  return (file) => used.some((pattern) => pattern.test(errorProneName(file)));
}

function quietInGenerated(head: readonly string[]): boolean {
  return projectFlags(head).includes(QUIET_GENERATED);
}

/** Whether the text may hold a `@Generated` annotation, which marks code Error Prone treats as generated. */
export function mayBeGenerated(text: string): boolean {
  return GENERATED_WORD.test(text);
}

type Row = { readonly rule: string; readonly file: string };

/**
 * With `-XepDisableWarningsInGeneratedCode`, Error Prone drops the findings below error level in code under an
 * annotation named `Generated`. For each file that may hold one, the engine's checks that found something there go
 * back to Error Prone, which decides; every file with rows when the sources are not in an ASCII-based encoding.
 */
export function handedBack(
  { head }: { readonly head: readonly string[] },
  rows: readonly Row[],
  levels: CheckLevels,
): ReadonlyMap<string, readonly string[]> {
  const back = new Map<string, string[]>();
  if (!quietInGenerated(head)) {
    return back;
  }
  const wide = WIDE_ENCODING.test(encodingOf(head) ?? '');
  const generated = new Map<string, boolean>();
  for (const { rule, file } of rows) {
    const marked = wide || (generated.get(file) ?? mayBeGenerated(readFileSync(file, 'latin1')));
    generated.set(file, marked);
    if (marked && levels.get(rule) !== 'ERROR') {
      back.set(file, [...new Set([...(back.get(file) ?? []), rule])]);
    }
  }
  return back;
}
