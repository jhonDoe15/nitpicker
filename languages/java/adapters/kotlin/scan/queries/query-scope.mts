import { escapeRegExp } from '../typed/typed-scan.mts';
import { DYNAMIC } from '../../../../../../shared/rules/security/sql-text.mjs';
import { literalAt, splitArguments } from '../kotlin-source.mts';
import { templatePieces } from '../security/sql-values.mts';
import type { Scanned, Literal } from '../typed/scan-shapes.mts';

const FUNCTION = /(?<![\w$])fun(?![\w$])/g;
const LEADING_SPACE = /^\s*/u;

export type FunctionScope = { start: number; end: number; text: string };

export function functionAround(code: string, offset: number): FunctionScope {
  const starts = [...code.matchAll(FUNCTION)].map(({ index }) => index);
  const start = starts.findLast((index) => index <= offset) ?? 0;
  const end = starts.find((index) => index > offset) ?? code.length;
  return { start, end, text: code.slice(start, end) };
}

export function literalText(literal: Literal): string {
  return templatePieces(literal)
    .map((piece) => ('text' in piece ? piece.text : DYNAMIC))
    .join('');
}

function literalFrom(scanned: Scanned, offset: number): Literal | undefined {
  const skipped = offset + (LEADING_SPACE.exec(scanned.code.slice(offset))?.[0] ?? '').length;
  return literalAt(scanned, skipped);
}

function declaredValue(
  scanned: Scanned,
  name: string,
  scope: FunctionScope | undefined,
): number | undefined {
  const declaration = new RegExp(
    String.raw`(?<![\w$])va[lr]\s+${escapeRegExp(name)}\s*(?::\s*String\s*)?=`,
    'g',
  );
  const local = scope === undefined ? undefined : (declaration.exec(scope.text) ?? undefined);
  if (scope !== undefined && local !== undefined) {
    return scope.start + local.index + local[0].length;
  }
  declaration.lastIndex = 0;
  const found = declaration.exec(scanned.code);
  return found === null ? undefined : found.index + found[0].length;
}

export function argumentText(
  scanned: Scanned,
  open: number,
  scope: FunctionScope | undefined,
): string | undefined {
  const first = splitArguments(scanned.code, open).parts[0];
  if (first === undefined) {
    return undefined;
  }
  const direct = literalFrom(scanned, first.start);
  if (direct !== undefined) {
    return scanned.code.slice(direct.end, first.end).trim() === ''
      ? literalText(direct)
      : undefined;
  }
  const name = scanned.code.slice(first.start, first.end).trim();
  const value = /^[A-Za-z_]\w*$/u.test(name) ? declaredValue(scanned, name, scope) : undefined;
  const held = value === undefined ? undefined : literalFrom(scanned, value);
  return held === undefined ? undefined : literalText(held);
}

export function argumentName(scanned: Scanned, open: number): string | undefined {
  const first = splitArguments(scanned.code, open).parts[0];
  const name = first === undefined ? '' : scanned.code.slice(first.start, first.end).trim();
  return /^[A-Za-z_]\w*$/u.test(name) ? name : undefined;
}

export function declarationOf(
  scanned: Scanned,
  name: string,
  scope: FunctionScope | undefined,
): string | undefined {
  const value = declaredValue(scanned, name, scope);
  if (value === undefined) {
    return undefined;
  }
  const end = scanned.code.indexOf('\n', value);
  return scanned.code.slice(value, end === -1 ? undefined : end);
}
