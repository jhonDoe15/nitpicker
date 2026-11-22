import {
  escapeRegExp as untypedEscapeRegExp,
  globToRegExpSource,
} from '../../../../../shared/paths/glob.mts';

const escapeRegExp: (value: string) => string = untypedEscapeRegExp;

const PREFIX_DIRECTORY_GLOB = /^([^?*{}[\]\\]+)\/\*\*$/u;
const ANY_DIRECTORY_GLOB = /^\*\*\/([^?*{}[\]\\]+)\/\*\*$/u;
const TRAILING_STAR_GLOB = /^([^/*?{}[\]\\]+)\*$/u;

type FoldedGlobs = {
  readonly prefixDirectories: string[];
  readonly anyDirectories: string[];
  readonly starPrefixes: string[];
  readonly other: string[];
};

function innerSource(glob: string): string {
  const full = globToRegExpSource(glob);
  return full.slice('^(?:'.length, -')$'.length);
}

function generalGlobPattern(glob: string): string {
  const fromAny = glob.startsWith('**/');
  const toAny = glob.endsWith('/**');
  if (fromAny && toAny && glob.length > 6) {
    return `(?:^|/)${innerSource(glob.slice(3, -3))}/`;
  }
  if (fromAny) {
    return `(?:^|/)${innerSource(glob.slice(3))}$`;
  }
  if (toAny) {
    return `^(?:${innerSource(glob.slice(0, -3))})/`;
  }
  return globToRegExpSource(glob);
}

function collectGlob(folded: FoldedGlobs, glob: string): void {
  const prefixMatch = PREFIX_DIRECTORY_GLOB.exec(glob);
  if (prefixMatch?.[1] !== undefined) {
    folded.prefixDirectories.push(prefixMatch[1]);
    return;
  }
  const anyMatch = ANY_DIRECTORY_GLOB.exec(glob);
  if (anyMatch?.[1] !== undefined) {
    folded.anyDirectories.push(anyMatch[1]);
    return;
  }
  const starMatch = TRAILING_STAR_GLOB.exec(glob);
  if (starMatch?.[1] !== undefined) {
    folded.starPrefixes.push(starMatch[1]);
    return;
  }
  folded.other.push(generalGlobPattern(glob));
}

function foldedAlternation(values: readonly string[]): string {
  return [...new Set(values)].map(escapeRegExp).join('|');
}

export function excludePatternFor(globs: readonly string[]): string | undefined {
  if (globs.length === 0) {
    return undefined;
  }
  const folded: FoldedGlobs = {
    prefixDirectories: [],
    anyDirectories: [],
    starPrefixes: [],
    other: [],
  };
  for (const glob of globs) {
    collectGlob(folded, glob);
  }
  const parts: string[] = [];
  if (folded.prefixDirectories.length > 0) {
    parts.push(`^(?:${foldedAlternation(folded.prefixDirectories)})/`);
  }
  if (folded.anyDirectories.length > 0) {
    parts.push(`(?:^|/)(?:${foldedAlternation(folded.anyDirectories)})/`);
  }
  if (folded.starPrefixes.length > 0) {
    parts.push(`^(?:${foldedAlternation(folded.starPrefixes)})[^/]*$`);
  }
  parts.push(...new Set(folded.other));
  return parts.join('|');
}
