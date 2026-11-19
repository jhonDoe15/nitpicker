import { messageOf, textsOf as stringsOf } from '../../../../../../shared/values/readers.mts';
import { SOURCE_PATHS } from './errorprone-words.mts';

const EXCLUDED_PATHS = '-XepExcludedPaths:';

export function pathCheck(pattern: string): { kind: string; message?: string } {
  try {
    const compiled = new RegExp(pattern, 'u');
    const excluded = new RegExp(`^(?:${compiled.source})$`, 'u');
    return { kind: SOURCE_PATHS.some((file) => excluded.test(file)) ? 'matches-sources' : 'kept' };
  } catch (error) {
    return { kind: 'invalid-pattern', message: messageOf(error) };
  }
}

export function unionedOptions(
  flags: readonly string[],
  lists: ReadonlyMap<string, unknown>,
): string[] {
  const merged = new Map<string, string[]>();
  const others = flags.filter((flag) => {
    const [key = '', value = ''] = flag.slice('-XepOpt:NullAway:'.length).split('=');
    if (!(flag.startsWith('-XepOpt:NullAway:') && lists.has(key))) {
      return true;
    }
    merged.set(key, [...(merged.get(key) ?? stringsOf(lists.get(key))), ...value.split(',')]);
    return false;
  });
  const unions = [...merged].map(
    ([key, values]) => `-XepOpt:NullAway:${key}=${[...new Set(values)].filter(Boolean).join(',')}`,
  );
  return [...others, ...unions];
}

export function excludedPaths(flags: string[]): string[] {
  const patterns = flags.filter((flag) => flag.startsWith(EXCLUDED_PATHS));
  const others = flags.filter((flag) => !flag.startsWith(EXCLUDED_PATHS));
  if (patterns.length < 2) {
    return flags;
  }
  const joined = patterns.map((flag) => `(?:${flag.slice(EXCLUDED_PATHS.length)})`);
  return [...others, `${EXCLUDED_PATHS}${joined.join('|')}`];
}
