import { capture } from '../../common/matches.mts';
import type { Occurrence } from '../../common/types.mts';
import { closingBracket, lineOfIndex } from '../text.mts';
import { handlerFinding, statementsOf } from './handlers.mts';

const BROAD_EXCEPTIONS = new Set(['Exception', 'BaseException', 'builtins.Exception']);
const EXCEPT_CLAUSE = /^[ \t]*except\*?[ \t]*([^:\n]*?)[ \t]*:[ \t]*(.*)$/u;
const TYPING_IMPORT =
  /^[ \t]*from[ \t]+typing(?:_extensions)?[ \t]+import[ \t]+(\([^)]*\)|[^\n]*)/gmu;
const TYPING_CAST = /\b(?:typing|typing_extensions|t)\s*\.\s*cast\s*\(/gu;
const SUPPRESS_ALL = /\bsuppress\s*\(\s*(?:builtins\.)?(?:Base)?Exception\s*\)/gu;

function indentOf(line: string): number {
  return (/^[ \t]*/u.exec(line)?.[0] ?? '').length;
}

function firstArgument({
  masked,
  text,
  open,
}: {
  masked: string;
  text: string;
  open: number;
}): string {
  const close = closingBracket(masked, open);
  const end = close === -1 ? masked.length : close;
  let depth = 0;
  for (const [offset, character] of masked
    .slice(open + 1, end)
    .split('')
    .entries()) {
    depth += Number('([{'.includes(character)) - Number(')]}'.includes(character));
    if (depth === 0 && character === ',') return text.slice(open + 1, open + 1 + offset).trim();
  }
  return text.slice(open + 1, end).trim();
}

function localNames(masked: string, name: string): string[] {
  const pattern = new RegExp(String.raw`\b${name}\b(?:\s+as\s+(\w+))?`, 'u');
  return [...masked.matchAll(TYPING_IMPORT)].flatMap((match) => {
    const found = pattern.exec(capture(match, 1).replaceAll(/[()]/gu, ' '));
    return found === null ? [] : [found[1] ?? name];
  });
}

function castOccurrences({ masked, text }: { masked: string; text: string }): Occurrence[] {
  const bare = localNames(masked, 'cast').map(
    (name) => new RegExp(String.raw`(?<![\w.])${name}\s*\(`, 'gu'),
  );
  return [TYPING_CAST, ...bare].flatMap((pattern) =>
    [...masked.matchAll(pattern)].map((match) => {
      const open = match.index + match[0].length - 1;
      const type = firstArgument({ masked, text, open }).replaceAll(/\s+/gu, ' ');
      return {
        kind: 'type-assertion',
        key: `cast|${type}`,
        line: lineOfIndex(masked, match.index),
        detail: `type assertion: cast(${type}, ...)`,
      };
    }),
  );
}

function countOf(line: string, character: string): number {
  return line.split(character).length - 1;
}

function importLines(lines: readonly string[]): boolean[] {
  let depth = 0;
  return lines.map((line) => {
    const inside = depth > 0 || /^[ \t]*(?:from[ \t]+\S+[ \t]+)?import\b/u.test(line);
    if (inside) depth = Math.max(0, depth + countOf(line, '(') - countOf(line, ')'));
    return inside;
  });
}

function anyOccurrences({ masked }: { masked: string }): Occurrence[] {
  const names = ['Any', ...localNames(masked, 'Any').filter((name) => name !== 'Any')];
  const pattern = new RegExp(String.raw`(?<![\w])(?:${names.join('|')})\b`, 'gu');
  const lines = masked.split('\n');
  const imports = importLines(lines);
  return lines.flatMap((line, index) =>
    imports[index]
      ? []
      : [...line.matchAll(pattern)].map(() => ({
          kind: 'any',
          key: 'any',
          line: index + 1,
          detail: 'Any type',
        })),
  );
}

function exceptBody({
  lines,
  at,
  header,
  inline,
}: {
  lines: readonly string[];
  at: number;
  header: string;
  inline: string;
}): string {
  if (inline !== '') return inline;
  const indent = indentOf(header);
  const end = lines.findIndex(
    (line, index) => index > at && line.trim() !== '' && indentOf(line) <= indent,
  );
  return lines.slice(at + 1, end === -1 ? undefined : end).join('\n');
}

function broadTypes(clause: string): string[] {
  const types = clause
    .replace(/\s+as\s+\w+$/u, '')
    .replaceAll(/[()\s]/gu, '')
    .split(',');
  return clause === '' ? ['bare'] : types.filter((type) => BROAD_EXCEPTIONS.has(type));
}

function exceptOccurrences({ masked }: { masked: string }): Occurrence[] {
  const lines = masked.split('\n');
  return lines.flatMap((line, at) => {
    const match = EXCEPT_CLAUSE.exec(line);
    if (match === null) return [];
    const body = exceptBody({ lines, at, header: line, inline: capture(match, 2).trim() });
    const found = handlerFinding({
      language: 'python',
      body,
      statements: statementsOf(body),
      broadTypes: broadTypes(capture(match, 1)),
      shown: capture(match, 1) === '' ? 'except:' : `except ${capture(match, 1)}:`,
    });
    return found === undefined ? [] : [{ ...found, line: at + 1 }];
  });
}

function suppressOccurrences({ masked }: { masked: string }): Occurrence[] {
  return [...masked.matchAll(SUPPRESS_ALL)].map((match) => ({
    kind: 'ignored-error',
    key: 'suppress',
    line: lineOfIndex(masked, match.index),
    detail: 'suppress(Exception) swallows every error',
  }));
}

export function pythonShortcuts({ masked, text }: { masked: string; text: string }): Occurrence[] {
  return [
    ...anyOccurrences({ masked }),
    ...castOccurrences({ masked, text }),
    ...exceptOccurrences({ masked }),
    ...suppressOccurrences({ masked }),
  ];
}
