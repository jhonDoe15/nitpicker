import { lineAt } from '../../../../../shared/conventions/lines.mjs';

export type Masked = { readonly code: string; readonly literals: string };
export type TypeBlock = {
  readonly kind: string;
  readonly name: string;
  readonly header: string;
  readonly start: number;
  readonly open: number;
  readonly close: number;
};
export type Method = {
  readonly start: number;
  readonly nameAt: number;
  readonly open: number;
  readonly close: number;
  readonly annotations: string;
  readonly modifiers: readonly string[];
  readonly returns: string;
  readonly name: string;
  readonly parameters: string;
  readonly throws: string;
  readonly depth: number;
};

const TYPE_DECLARATION = /\b(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/gu;
const ANNOTATIONS = /(?<annotations>(?:@[\w.]+(?:\([^()]*\))?\s+)*)/u;
const MODIFIERS =
  /(?<modifiers>(?:(?:public|private|protected|static|final|abstract|synchronized|native|default|strictfp)\s+)*)/u;
const RETURNS = /(?<returns>[\w.$]+(?:<[^;(){}]*>)?(?:\[\])*)\s+/u;
const SIGNATURE = /(?<name>[A-Za-z_]\w*)\s*\((?<parameters>[^()]*)\)\s*/u;
const THROWS = /(?<throws>throws\s+[\w.]+(?:\s*,\s*[\w.]+)*\s*)?\{/u;
const METHOD_DECLARATION = new RegExp(
  [ANNOTATIONS, MODIFIERS, RETURNS, SIGNATURE, THROWS].map(({ source }) => source).join(''),
  'gu',
);
const NOT_A_RETURN_TYPE = new Set(['new', 'return', 'else', 'throw', 'case', 'yield', 'assert']);
const LITERAL_OR_COMMENT =
  /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"""[\s\S]*?(?:"""|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/gu;
const TEXT_BLOCK = '"""';
const NESTING: Readonly<Record<string, number>> = {
  '<': 1,
  '(': 1,
  '[': 1,
  '{': 1,
  '>': -1,
  ')': -1,
  ']': -1,
  '}': -1,
};

export const lineOf: (text: string, offset: number) => number = lineAt;

function isComment(piece: string): boolean {
  return piece.startsWith('//') || piece.startsWith('/*');
}

function blankInside(piece: string, keep: number): string {
  const edge = piece.slice(0, keep);
  const closed = piece.length >= keep * 2 && piece.endsWith(edge);
  const inner = piece.slice(keep, closed ? piece.length - keep : piece.length);
  return edge + inner.replace(/[^\n\r]/gu, ' ') + (closed ? edge : '');
}

function codeOf(piece: string): string {
  if (isComment(piece)) {
    return blankInside(piece, 0);
  }
  return blankInside(piece, piece.startsWith(TEXT_BLOCK) ? TEXT_BLOCK.length : 1);
}

export function maskedOf(text: string): Masked {
  return {
    code: text.replace(LITERAL_OR_COMMENT, codeOf),
    literals: text.replace(LITERAL_OR_COMMENT, (piece) =>
      isComment(piece) ? blankInside(piece, 0) : piece,
    ),
  };
}

export function depthsOf(code: string): Int32Array {
  const depths = new Int32Array(code.length + 1);
  let depth = 0;
  for (const [at, char] of code.split('').entries()) {
    depths[at] = depth;
    depth += Number(char === '{') - Number(char === '}');
  }
  depths[code.length] = depth;
  return depths;
}

export function closing(code: string, open: number, pair: '{}' | '()'): number {
  const [up, down] = pair;
  let depth = 0;
  for (const [offset, char] of code.slice(open).split('').entries()) {
    depth += Number(char === up) - Number(char === down);
    if (depth === 0) {
      return open + offset;
    }
  }
  return -1;
}

export function typeBlocksOf(code: string, depths: Int32Array): TypeBlock[] {
  return [...code.matchAll(TYPE_DECLARATION)].flatMap((found) => {
    const start = found.index;
    const open = code.indexOf('{', start);
    const close = open === -1 ? -1 : closing(code, open, '{}');
    const nameEnd = start + found[0].length;
    return depths[start] === 0 && close !== -1
      ? [
          {
            kind: found[0].split(/\s/u)[0] ?? '',
            name: found[1] ?? '',
            header: code.slice(nameEnd, open),
            start,
            open,
            close,
          },
        ]
      : [];
  });
}

function startsStatement(code: string, start: number): boolean {
  const before = code.slice(0, start).trimEnd();
  return before === '' || ';{}'.includes(before.slice(-1));
}

export function methodsOf(code: string, depths: Int32Array): Method[] {
  return [...code.matchAll(METHOD_DECLARATION)].flatMap((found) => {
    const { annotations = '', modifiers = '', returns = '', name = '' } = found.groups ?? {};
    const start = found.index;
    const open = start + found[0].length - 1;
    const close = closing(code, open, '{}');
    const headLength = annotations.length + modifiers.length + returns.length;
    return NOT_A_RETURN_TYPE.has(returns) || close === -1 || !startsStatement(code, start)
      ? []
      : [
          {
            start,
            nameAt: start + found[0].indexOf(name, headLength),
            open,
            close,
            annotations: annotations.trim(),
            modifiers: modifiers.split(/\s+/u).filter((word) => word !== ''),
            returns,
            name,
            parameters: found.groups?.['parameters'] ?? '',
            throws: (found.groups?.['throws'] ?? '').trim(),
            depth: depths[start] ?? 0,
          },
        ];
  });
}

export function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (const [at, char] of text.split('').entries()) {
    depth += NESTING[char] ?? 0;
    if (char === ',' && depth === 0) {
      parts.push(text.slice(from, at));
      from = at + 1;
    }
  }
  parts.push(text.slice(from));
  return parts.map((part) => part.trim());
}

export function compact(text: string): string {
  return text.replace(/\s+/gu, '');
}
