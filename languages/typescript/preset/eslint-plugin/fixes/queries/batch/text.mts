import type { TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import type { SourceCode } from '../../../rules/typed/node-views.mts';
import { ts } from '../../../rules/typed/typescript-views.mts';
import { freeName } from '../../edits/names.mts';

export type Edit = { readonly range: TSESTree.Range; readonly text: string };

const TYPESCRIPT_FILE = /\.[cm]?tsx?$/u;
const MAX_TYPE_TEXT = 160;

export const CHUNK = 500;

export function isTypeScriptFile(filename: string): boolean {
  return TYPESCRIPT_FILE.test(filename);
}

export function indentOf(sourceCode: SourceCode, node: TSESTree.Node): string {
  const start = node.range[0];
  const lineStart = sourceCode.text.lastIndexOf('\n', start - 1) + 1;
  return /^[ \t]*/u.exec(sourceCode.text.slice(lineStart, start))?.[0] ?? '';
}

export function spliced(
  sourceCode: SourceCode,
  outer: TSESTree.Range,
  edits: readonly Edit[],
): string {
  let text = '';
  let position = outer[0];
  for (const edit of edits.toSorted((left, right) => left.range[0] - right.range[0])) {
    text += sourceCode.text.slice(position, edit.range[0]) + edit.text;
    position = edit.range[1];
  }
  return text + sourceCode.text.slice(position, outer[1]);
}

export function printedType(
  checker: TypeScript.TypeChecker,
  type: TypeScript.Type,
  at: TypeScript.Node,
): string | undefined {
  const text = checker.typeToString(type, at, ts.TypeFormatFlags.NoTruncation);
  const printable =
    !text.includes('import(') && !text.includes('...') && text.length <= MAX_TYPE_TEXT;
  return printable && text !== 'any' ? text : undefined;
}

export type Names = {
  readonly map: string;
  readonly index: string;
  readonly part: string;
  readonly row: string;
  readonly keys: string;
  readonly group: string;
};

export function pickNames(
  sourceCode: SourceCode,
  at: TSESTree.Statement,
  mapBase: string,
): Names | undefined {
  const [map, index, part, row, keys, group] = [
    mapBase,
    'index',
    'part',
    'row',
    'keys',
    'group',
  ].map((base) => freeName(sourceCode, { sites: [at], within: at, base }));
  if (
    map === undefined ||
    index === undefined ||
    part === undefined ||
    row === undefined ||
    keys === undefined ||
    group === undefined
  ) {
    return undefined;
  }
  return { map, index, part, row, keys, group };
}

export function pluralOf(name: string): string {
  if (/[^aeiou]y$/u.test(name)) {
    return `${name.slice(0, -1)}ies`;
  }
  return /(?:s|x|ch|sh)$/u.test(name) ? `${name}es` : `${name}s`;
}
