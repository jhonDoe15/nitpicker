import { readProjectFile } from '../project-files.mts';
import { escapeRegExp as untypedEscape } from '../../../../shared/paths/glob.mjs';
import type { DependencyEntry, DependencySource } from '../typed/dependency-types.mts';
import { groupOf, requirementEntries } from './requirement-names.mts';

const SETUP_PY = 'setup.py';
const escapeRegExp: (value: string) => string = untypedEscape;
const PAIRS: Record<string, string> = { '[': ']', '{': '}', '(': ')' };
const CLOSERS = Object.values(PAIRS);
const STRING = /(["'])((?:(?!\1).)+)\1/gu;
const EXTRA = /(["'])([^"']+)\1\s*:\s*(?=\[)/gu;

function quoteAfter(quote: string | undefined, character: string): string | undefined {
  if (quote !== undefined) {
    return character === quote ? undefined : quote;
  }
  return character === '"' || character === "'" ? character : undefined;
}

function structuralCharacters(text: string, start: number): [number, string][] {
  const marks: [number, string][] = [];
  let quote: string | undefined;
  for (const [offset, character] of Array.from(text.slice(start)).entries()) {
    const quoted = quote !== undefined;
    quote = quoteAfter(quote, character);
    if (!quoted && quote === undefined) {
      marks.push([start + offset, character]);
    }
  }
  return marks;
}

function closing(text: string, start: number): number {
  let depth = 0;
  for (const [index, character] of structuralCharacters(text, start)) {
    depth += character in PAIRS ? 1 : 0;
    depth -= CLOSERS.includes(character) ? 1 : 0;
    if (depth === 0) {
      return index;
    }
  }
  return -1;
}

function literalAfter(source: string, key: string): string | undefined {
  const match = new RegExp(`\\b${escapeRegExp(key)}\\s*=\\s*[\\[{(]`, 'u').exec(source);
  if (match === null) {
    return undefined;
  }
  const start = match.index + match[0].length - 1;
  const end = closing(source, start);
  return end === -1 ? undefined : source.slice(start, end + 1);
}

function stringsOf(literal: string): string[] {
  return [...literal.matchAll(STRING)].map((match) => match[2] ?? '');
}

function extraEntries(literal: string): DependencyEntry[] {
  return [...literal.matchAll(EXTRA)].flatMap((match) => {
    const start = match.index + match[0].length;
    const end = closing(literal, start);
    return requirementEntries(
      stringsOf(literal.slice(start, end + 1)),
      groupOf(match[2], 'optional'),
      SETUP_PY,
    );
  });
}

function withoutComment(line: string): string {
  let quote: string | undefined;
  for (const [index, character] of Array.from(line).entries()) {
    if (quote !== undefined) {
      quote = character === quote ? undefined : quote;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '#') {
      return line.slice(0, index);
    }
  }
  return line;
}

function listEntries(source: string, key: string, group: string): DependencyEntry[] {
  const literal = literalAfter(source, key);
  return literal === undefined ? [] : requirementEntries(stringsOf(literal), group, SETUP_PY);
}

export function readSetupPy(projectRoot: string): DependencySource | undefined {
  const text = readProjectFile(projectRoot, SETUP_PY);
  if (text === undefined) {
    return undefined;
  }
  const source = text.split(/\r?\n/u).map(withoutComment).join('\n');
  const extras = literalAfter(source, 'extras_require');
  return {
    entries: [
      ...listEntries(source, 'install_requires', 'production'),
      ...listEntries(source, 'tests_require', 'dev'),
      ...(extras === undefined ? [] : extraEntries(extras)),
    ],
    declares: literalAfter(source, 'install_requires') !== undefined,
  };
}
