import { closingOrEnd } from '../../../../source/frames/bracket-depths.mts';
import { escapeRegExp } from '../typed/typed-scan.mts';
import {
  braceDepths,
  enclosingOpen,
  inImport,
  literalAt,
  parenDepths,
  splitArguments,
} from '../kotlin-source.mts';
import type { Scanned, Literal, Subjected } from '../typed/scan-shapes.mts';
import { PLAIN_RULE, REGEX_MESSAGES, UNQUOTED_RULE } from './regex-messages.mts';
import type { Span } from '../typed/rule-shapes.mts';

const BRACE_DEPTH: Readonly<Record<string, number>> = { '{': 1, '}': -1 };
const CONSTRUCTOR =
  /(?<![\w.])(?:kotlin\.text\.)?Regex\s*\(|(?<![\w.])(?:java\.util\.regex\.)?Pattern\s*\.\s*compile\s*\(/g;
const CONVERSION = /\.\s*to(?:Regex|Pattern)\s*\(/g;
const PLAIN_USE = /\.\s*(?:replace|replaceFirst|split|contains)\s*\(/g;
const ESCAPED =
  /^(?:(?:kotlin\.text\.)?Regex\s*\.\s*escape|(?:java\.util\.regex\.)?Pattern\s*\.\s*quote)\s*\(/;
const CONSTANT = /^(?:[A-Z]\w*\.)*[A-Z][A-Z0-9_]*$/;
const PATTERN_SOURCE = /\.\s*pattern(?:\s*\(\s*\))?$/;
const ROOT_NAME = /^[A-Za-z_]\w*/;
const CALLED_NAME = /^(?:[A-Za-z_]\w*\s*\.\s*)*([A-Za-z_]\w*)\s*\(/;
const LITERAL_END = /^[ \t]*(?:$|[;}\n]|\/\/)/;
const NUMBER = /^-?\d[\w.]*/;
const NON_TEXT_TYPES = 'Int|Long|Short|Byte|Double|Float|Boolean|Char|UInt|ULong';
const OWNER_BEFORE = /\b(?:companion\s+object|object\s+[A-Za-z_]\w*)\b[^{};]*$/;
const TEMPLATE_ENTRY = /\$(?:\{|([A-Za-z_]\w*))/g;
const METACHARACTERS = /[\\^$.|?*+()[\]{}]/;
const OWNER_LOOKBEHIND = 200;
const UNICODE_ESCAPE_LENGTH = 5;
const ESCAPES: Readonly<Record<string, string>> = {
  t: '\t',
  b: '\b',
  n: '\n',
  r: '\r',
  "'": "'",
  '"': '"',
  '\\': '\\',
  $: '$',
};

export function trimmed(code: string, { start, end }: Span): Span {
  const text = code.slice(start, end);
  const from = start + text.length - text.trimStart().length;
  return { start: from, end: from + text.trim().length };
}

function plusOperands(code: string, depths: Int32Array, part: Span): Span[] {
  const level = depths[part.start];
  const pluses = [...code.slice(part.start, part.end).matchAll(/\+/g)]
    .map(({ index }) => part.start + index)
    .filter((index) => depths[index] === level);
  const starts = [part.start, ...pluses.map((index) => index + 1)];
  const ends = [...pluses, part.end];
  return starts.map((start, index) => trimmed(code, { start, end: ends[index] ?? part.end }));
}

function closingBrace(text: string, open: number): number {
  return closingOrEnd(text, open, BRACE_DEPTH);
}

function isEscapedDollar(literal: Literal, index: number): boolean {
  if (literal.raw) {
    return false;
  }
  const slashes = (/\\*$/.exec(literal.text.slice(0, index))?.[0] ?? '').length;
  return slashes % 2 === 1;
}

function templateEntries(literal: Literal): { text: string; offset: number }[] {
  return [...literal.text.matchAll(TEMPLATE_ENTRY)]
    .filter(({ index }) => !isEscapedDollar(literal, index))
    .map((match) => {
      if (match[1] !== undefined) {
        return { text: match[1], offset: literal.bodyStart + match.index };
      }
      const open = match.index + 1;
      const close = closingBrace(literal.text, open);
      return {
        text: literal.text.slice(open + 1, close).trim(),
        offset: literal.bodyStart + match.index,
      };
    });
}

function isOwnedDeclaration(code: string, index: number): boolean {
  if (braceDepths(code)[index] === 0) {
    return true;
  }
  const open = enclosingOpen(code, index);
  return OWNER_BEFORE.test(code.slice(Math.max(0, open - OWNER_LOOKBEHIND), open));
}

function isEscapeHelper(text: string): boolean {
  const name = CALLED_NAME.exec(text)?.[1]?.toLowerCase() ?? '';
  return /escape|quote/.test(name) && !name.startsWith('un') && /reg|pattern/.test(name);
}

function isLiteralValue(scanned: Scanned, index: number): boolean {
  const rest = scanned.code.slice(index);
  const value = /^[^=\n]*=\s*/.exec(rest);
  if (value === null) {
    return false;
  }
  const start = index + value[0].length;
  const literal = literalAt(scanned, start);
  const end = literal === undefined || literal.template ? undefined : literal.end;
  const after = end ?? start + (NUMBER.exec(scanned.code.slice(start))?.[0].length ?? 0);
  return after > start && LITERAL_END.test(scanned.code.slice(after));
}

function isConstantName(scanned: Scanned, name: string): boolean {
  const { code } = scanned;
  const typed = new RegExp(
    String.raw`(?<![\w.])${escapeRegExp(name)}\s*:\s*(?:${NON_TEXT_TYPES})\b`,
  );
  if (typed.test(code)) {
    return true;
  }
  const declared = [
    ...code.matchAll(new RegExp(String.raw`\b(const\s+)?val\s+${escapeRegExp(name)}\b`, 'g')),
  ];
  const parameter = new RegExp(
    String.raw`[(,]\s*(?:va[lr]\s+)?${escapeRegExp(name)}\s*:|[{,]\s*${escapeRegExp(name)}\s*(?:,[\w\s,]*)?->`,
  );
  return (
    declared.length > 0 &&
    !parameter.test(code) &&
    declared.every(
      (match) =>
        match[1] !== undefined ||
        isOwnedDeclaration(code, match.index) ||
        isLiteralValue(scanned, match.index),
    )
  );
}

function isRuntimeExpression(scanned: Scanned, text: string): boolean {
  const quoted = ESCAPED.test(text) || isEscapeHelper(text);
  if (quoted || CONSTANT.test(text) || PATTERN_SOURCE.test(text)) {
    return false;
  }
  if (/^-?\d/.test(text)) {
    return false;
  }
  const root = ROOT_NAME.exec(text)?.[0];
  return root !== undefined && !isConstantName(scanned, root);
}

function runtimeInOperand(
  scanned: Scanned,
  operand: Span,
  alone: boolean,
): { text: string; offset: number } | undefined {
  const literal = literalAt(scanned, operand.start);
  if (literal !== undefined && literal.end === operand.end) {
    return literal.template
      ? templateEntries(literal).find((entry) => isRuntimeExpression(scanned, entry.text))
      : undefined;
  }
  const text = scanned.source.slice(operand.start, operand.end).trim();
  if (alone || !isRuntimeExpression(scanned, text)) {
    return undefined;
  }
  return { text, offset: operand.start };
}

function unquotedIn(
  scanned: Scanned,
  depths: Int32Array,
  part: Span,
): { text: string; offset: number } | undefined {
  const operands = plusOperands(scanned.code, depths, trimmed(scanned.code, part));
  const alone = operands.length === 1;
  return operands.map((operand) => runtimeInOperand(scanned, operand, alone)).find(Boolean);
}

function receiverPart(scanned: Scanned, dot: number): Span | undefined {
  const before = scanned.code.slice(0, dot).trimEnd();
  const end = before.length;
  const last = before.at(-1);
  if (last === '"') {
    const literal = scanned.literals.find((candidate) => candidate.end === end);
    return literal === undefined ? undefined : { start: literal.start, end };
  }
  if (last !== ')') {
    return undefined;
  }
  const depths = parenDepths(scanned.code);
  const level = depths[end - 1];
  const chars = scanned.code.slice(0, end - 1).split('');
  const open = Math.max(
    0,
    chars.findLastIndex((char, index) => char === '(' && depths[index] === level),
  );
  const head = scanned.code.slice(0, open).trimEnd();
  return /[\w)\]]$/.test(head) ? undefined : { start: open + 1, end: end - 1 };
}

export type RegexSite = {
  part: Span;
  options: Span[];
  count: number;
  start: number;
  end: number;
};

export function regexSites(scanned: Scanned): RegexSite[] {
  const { code } = scanned;
  const constructed = [...code.matchAll(CONSTRUCTOR)]
    .filter(({ index }) => !inImport(code, index))
    .flatMap((match) => {
      const open = match.index + match[0].length - 1;
      const { parts, close } = splitArguments(code, open);
      const [part, ...options] = parts;
      return part === undefined
        ? []
        : [{ part, options, count: parts.length, start: match.index, end: close + 1 }];
    });
  const converted = [...code.matchAll(CONVERSION)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const { parts, close } = splitArguments(code, open);
    const part = receiverPart(scanned, match.index);
    return part === undefined
      ? []
      : [{ part, options: parts, count: parts.length + 1, start: part.start, end: close + 1 }];
  });
  return [...constructed, ...converted];
}

export function unquotedRegexValues(scanned: Scanned): Subjected[] {
  const depths = parenDepths(scanned.code);
  return regexSites(scanned).flatMap((site) => {
    const runtime = unquotedIn(scanned, depths, site.part);
    return runtime === undefined
      ? []
      : [{ rule: UNQUOTED_RULE, offset: site.start, subject: runtime.text }];
  });
}

function decoded(literal: Literal): string {
  if (literal.raw) {
    return literal.text;
  }
  return literal.text.replaceAll(/\\(u[0-9a-fA-F]{4}|.)/g, (_all: string, escape: string) =>
    escape.length === UNICODE_ESCAPE_LENGTH
      ? String.fromCodePoint(Number.parseInt(escape.slice(1), 16))
      : (ESCAPES[escape] ?? `\\${escape}`),
  );
}

export function literalText(scanned: Scanned, part: Span): string | undefined {
  const operand = trimmed(scanned.code, part);
  const literal = literalAt(scanned, operand.start);
  return literal === undefined || literal.template || literal.end !== operand.end
    ? undefined
    : decoded(literal);
}

function plainLiteral(scanned: Scanned, part: Span): string | undefined {
  const text = literalText(scanned, part);
  return text === undefined || METACHARACTERS.test(text) || text === '' ? undefined : text;
}

export function plainTextRegexes(scanned: Scanned): Subjected[] {
  const { code } = scanned;
  const sites = regexSites(scanned).filter((site) => site.count === 1);
  return [...code.matchAll(PLAIN_USE)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const first = splitArguments(code, open).parts[0];
    if (first === undefined) {
      return [];
    }
    const argument = trimmed(code, first);
    const site = sites.find(({ start, end }) => start === argument.start && end === argument.end);
    const text = site === undefined ? undefined : plainLiteral(scanned, site.part);
    return site === undefined || text === undefined
      ? []
      : [{ rule: PLAIN_RULE, offset: site.start, subject: text }];
  });
}

export const kotlinSourceRules = {
  messages: REGEX_MESSAGES,
  main: [unquotedRegexValues, plainTextRegexes],
};
