import { closingIndex, literalAt } from '../kotlin-source.mts';
import { afterKept, httpSources, isStructuredHeader, isValueHeader } from './http-sources.mts';
import type { HttpSource } from './http-sources.mts';
import { cookiePrefixes, extensionLookups } from './cookie-and-extension.mts';
import type { Scanned } from '../typed/scan-shapes.mts';

const PARSERS = [
  'MediaType.parseMediaType(value)',
  'ContentDisposition.parse(value)',
  'HttpCookie.parse(value)',
];
const HTTP_VALUE_MESSAGES = {
  HttpValueCase: [
    'Media types, charsets, encodings, URI schemes and hosts, cookie name prefixes and file extensions',
    'are case-insensitive, so this exact comparison misses `Application/JSON` or `photo.PNG`.',
    'Lowercase first (`value.lowercase()`), pass `ignoreCase = true`, or parse it',
    `(${PARSERS.map((parser) => `\`${parser}\``).join(', ')}).`,
  ].join(' '),
  HandSplitHttpHeader: [
    'A structured header split by hand breaks on quoted values, whitespace and quality weights.',
    `Parse it with ${PARSERS.map((parser) => `\`${parser}\``).join(', ')}.`,
    'A library that is itself the parser takes an exceptions entry.',
  ].join(' '),
};
const LETTER = /[a-z]/i;
const EQUALITY = /^\s*(?:===?|!==?)\s*(?<quote>")/;
const EQUALS_CALL = /^\s*\??\.\s*equals\s*\(\s*(?<quote>")/;
const TEXT_CALL = /^\s*\??\.\s*(?:startsWith|endsWith|contains|indexOf)\s*\(\s*(?<quote>")/;
const SPLIT_CALL = /^\s*\??\.\s*(?:split|splitToSequence)\s*\(/;
const REVERSED = /" *"\s*(?:===?|!==?)\s*[\w.?]*$/;
const WHEN_SUBJECT = /\bwhen\s*\(\s*[\w.?]*$/;
const LOOKUP_BEFORE =
  /\b(?<owner>\w+)\s*(?:\.\s*(?:contains|containsKey|get|getValue)\s*\(|\[)\s*$/;
const LOOKUP_AFTER = /^\s*(?:[)\]]|in\s+\w+)/;
const IGNORE_CASE = /,\s*(?:ignoreCase\s*=\s*)?true\b/;
const SEPARATORS = /^[\s,;]+$/;

function literalWithLetters(scanned: Scanned, index: number): boolean {
  const literal = literalAt(scanned, index);
  return literal !== undefined && LETTER.test(literal.text);
}

function callArguments(code: string, from: number): { open: number; close: number } {
  const open = code.indexOf('(', from);
  return { open, close: closingIndex(code, open) };
}

function comparesText(scanned: Scanned, source: HttpSource, position: number): boolean {
  const { code } = scanned;
  const rest = code.slice(position);
  const matched = EQUALITY.exec(rest) ?? EQUALS_CALL.exec(rest) ?? TEXT_CALL.exec(rest);
  if (matched === null) {
    return REVERSED.test(code.slice(0, source.from));
  }
  const quote = position + matched.index + matched[0].length - 1;
  const call = matched[0].includes('(');
  const close = call ? callArguments(code, position + matched.index).close : position;
  const callText = scanned.source.slice(quote, close);
  return literalWithLetters(scanned, quote) && !IGNORE_CASE.test(callText);
}

function switchesOn(scanned: Scanned, source: HttpSource, position: number): boolean {
  const { code } = scanned;
  const brace = /^\s*\)\s*\{/.exec(code.slice(position));
  if (brace === null || !WHEN_SUBJECT.test(code.slice(0, source.from))) {
    return false;
  }
  const open = position + brace[0].length - 1;
  return scanned.literals.some(
    (literal) =>
      literal.start > open &&
      literal.end < closingIndex(code, open) &&
      LETTER.test(literal.text) &&
      /^\s*(?:,|->)/.test(code.slice(literal.end)),
  );
}

function usedAsKey(scanned: Scanned, source: HttpSource, position: number): boolean {
  const before = LOOKUP_BEFORE.exec(scanned.code.slice(0, source.from));
  return (
    before !== null &&
    !/headers?$/i.test(before.groups?.['owner'] ?? '') &&
    LOOKUP_AFTER.test(scanned.code.slice(position))
  );
}

function readsFirstPart(scanned: Scanned, close: number): boolean {
  return /^\)\s*(?:\[\s*0\s*\]|\??\.\s*first(?:OrNull)?\s*\(\s*\))/.test(scanned.code.slice(close));
}

function splitsByHand(scanned: Scanned, position: number, header: string | undefined): boolean {
  const { code } = scanned;
  if (!SPLIT_CALL.test(code.slice(position))) {
    return false;
  }
  const { open, close } = callArguments(code, position);
  const text = scanned.source.slice(open + 1, close);
  const separator = /^\s*["'](?<body>[^"']*)["']/.exec(text);
  const pattern = /Regex\s*\(\s*"(?<body>[^"]*)"/.exec(text);
  const separatorBody = separator?.groups?.['body'] ?? '';
  const patternBody = pattern?.groups?.['body'] ?? '';
  const mediaType =
    header === 'content-type' && /^\s*"\s*;\s*"\s*$/.test(text) && readsFirstPart(scanned, close);
  const splitting =
    (separator !== null && SEPARATORS.test(separatorBody) && /[,;]/.test(separatorBody)) ||
    (pattern !== null && /[,;]/.test(patternBody));
  return splitting && !mediaType;
}

function useOf(scanned: Scanned, source: HttpSource): string | undefined {
  const position = afterKept(scanned.code, source.to);
  if (splitsByHand(scanned, position, source.header)) {
    return isStructuredHeader(source.header) ? 'HandSplitHttpHeader' : undefined;
  }
  const cased = source.kind === 'uri' || isValueHeader(source.header);
  const compared =
    comparesText(scanned, source, position) ||
    switchesOn(scanned, source, position) ||
    usedAsKey(scanned, source, position);
  return cased && compared ? 'HttpValueCase' : undefined;
}

export function httpValues(scanned: Scanned): { rule: string; offset: number }[] {
  const reported = httpSources(scanned).flatMap((source) => {
    const rule = useOf(scanned, source);
    return rule === undefined ? [] : [{ rule, offset: source.from }];
  });
  return [...reported, ...cookiePrefixes(scanned), ...extensionLookups(scanned)];
}

export const kotlinSourceRules = { messages: HTTP_VALUE_MESSAGES, main: [httpValues] };
