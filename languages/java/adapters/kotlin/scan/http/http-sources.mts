import { escapeRegExp } from '../typed/typed-scan.mts';
import { closingIndex, enclosingOpen, lineStart } from '../kotlin-source.mts';
import type { Scanned } from '../typed/scan-shapes.mts';

export type HttpSource = { from: number; to: number; header: string | undefined; kind: string };
type SourcePattern = { pattern: RegExp; header?: string; kind?: string };

function anyOf(parts: string[]): RegExp {
  const alternation = new RegExp(parts.join('|'), 'u');
  return new RegExp(`^(?:${alternation.source})$`, 'u');
}
const ACCEPT = 'accept(?:-(?:charset|encoding|language))?';
const VALUE_HEADERS = anyOf([
  ACCEPT,
  'content-(?:type|encoding|language|disposition)',
  'transfer-encoding',
  'connection',
  'upgrade',
  'cache-control',
  'pragma',
  '(?:proxy-)?authorization',
  'www-authenticate',
  'expect',
  'te',
  'host',
  'origin',
  'forwarded',
  'x-forwarded-(?:proto|host|scheme)',
  'sec-fetch-\\w+',
  'vary',
]);
const STRUCTURED_HEADERS = anyOf([
  ACCEPT,
  'content-(?:type|disposition|language)',
  'cache-control',
  'if-none-match',
  'if-match',
  'cookie',
  'set-cookie',
  'forwarded',
  'vary',
  'prefer',
  'link',
]);
const HEADER_GETTERS = 'getHeader|getHeaderString|getFirst|firstHeader|firstValue';
const HEADER_ARGUMENT = String.raw`" *"|(?:HttpHeaders\s*\.\s*)?[A-Z][A-Z_]+`;
const SOURCES: SourcePattern[] = [
  {
    pattern: new RegExp(
      String.raw`\.\s*(?:${HEADER_GETTERS})\s*\(\s*(?<arg>${HEADER_ARGUMENT})\s*\)(?:\s*!!)?`,
      'gd',
    ),
  },
  {
    pattern: new RegExp(
      String.raw`\b\w*[hH]eaders\s*(?:\(\s*\)\s*)?\[\s*(?<arg>${HEADER_ARGUMENT})\s*\](?:\s*!!)?`,
      'gd',
    ),
  },
  {
    pattern:
      /(?<![\w.])(?:request|req|servletRequest)\s*\.\s*(?:contentType\b(?!\s*\()|getContentType\s*\(\s*\))(?:\s*!!)?/g,
    header: 'content-type',
  },
  {
    pattern:
      /\b\w*[uU]ri\s*\??\.\s*(?:scheme|host|getScheme\s*\(\s*\)|getHost\s*\(\s*\))(?:\s*!!)?/g,
    kind: 'uri',
  },
];
const PARAMETER_SOURCE = new RegExp(
  String.raw`@RequestHeader\s*\(\s*(?:(?:name|value)\s*=\s*)?(?<arg>${HEADER_ARGUMENT})\s*\)` +
    String.raw`\s*(?:val\s+|var\s+)?(?<name>\w+)\s*:\s*String`,
  'gd',
);
const LOCAL_DECLARATION = /\bval\s+(\w+)\s*(?::[^=\n]+)?=\s*[\w.]*\??$/;
const KEPT_CALLS = /\s*\??\.\s*(?:trim|trimStart|trimEnd|orEmpty|toString)\s*\(\s*\)/gy;
const OTHER_CALL = /^\s*\??\.\s*\w+/;
const EMPTY_FALLBACK = /^\s*\?:\s*" *"\s*$/m;

function headerName(scanned: Scanned, index: number, text: string): string | undefined {
  if (text.startsWith('"')) {
    return scanned.literals.find(({ start }) => start === index)?.text.toLowerCase();
  }
  return text
    .replace(/^HttpHeaders\s*\.\s*/, '')
    .replaceAll('_', '-')
    .toLowerCase();
}

export function isValueHeader(header: string | undefined): boolean {
  return header !== undefined && VALUE_HEADERS.test(header);
}

export function isStructuredHeader(header: string | undefined): boolean {
  return header !== undefined && STRUCTURED_HEADERS.test(header);
}

export function afterKept(code: string, offset: number): number {
  const calls = new RegExp(KEPT_CALLS);
  calls.lastIndex = offset;
  let position = offset;
  for (const kept of code.matchAll(calls)) {
    position = kept.index + kept[0].length;
  }
  return position;
}

function directSources(scanned: Scanned): HttpSource[] {
  const { code } = scanned;
  return SOURCES.flatMap(({ pattern, header, kind = 'header' }) =>
    [...code.matchAll(pattern)].map((match) => {
      const arg = match.indices?.groups?.['arg'];
      const named =
        arg === undefined ? header : headerName(scanned, arg[0], match.groups?.['arg'] ?? '');
      const receiver = match[0].startsWith('.')
        ? (/[\w.?]*$/.exec(code.slice(0, match.index))?.[0] ?? '')
        : '';
      return {
        from: match.index - receiver.length,
        to: match.index + match[0].length,
        header: named,
        kind,
      };
    }),
  );
}

function scopeEnd(code: string, offset: number): number {
  const open = enclosingOpen(code, offset);
  return open === -1 ? code.length : closingIndex(code, open);
}

function localReferences(code: string, source: HttpSource): HttpSource[] {
  const line = lineStart(code, source.from);
  const declared = LOCAL_DECLARATION.exec(code.slice(line, source.from));
  const rest = code.slice(
    afterKept(code, source.to),
    code.indexOf('\n', source.to) + 1 || code.length,
  );
  const plain = !OTHER_CALL.test(rest) && (rest.trim() === '' || EMPTY_FALLBACK.test(rest));
  if (declared === null || !plain) {
    return [];
  }
  const uses = new RegExp(
    String.raw`(?<![\w.])${escapeRegExp(declared[1] ?? '')}\b(?!\s*=[^=])`,
    'g',
  );
  const from = code.indexOf('\n', source.to);
  const end = scopeEnd(code, source.from);
  return [...code.slice(from === -1 ? code.length : from, end).matchAll(uses)].map((use) => ({
    from: from + use.index,
    to: from + use.index + use[0].length,
    header: source.header,
    kind: source.kind,
  }));
}

function parameterReferences(scanned: Scanned): HttpSource[] {
  const { code } = scanned;
  return [...code.matchAll(PARAMETER_SOURCE)].flatMap((match) => {
    const groups = match.groups ?? {};
    const header = headerName(
      scanned,
      match.indices?.groups?.['arg']?.[0] ?? 0,
      groups['arg'] ?? '',
    );
    const close = closingIndex(code, code.indexOf('(', functionStart(code, match.index)));
    const body = /^[^{=]*([{=])/.exec(code.slice(close + 1));
    const bodyStart = close + 1 + (body?.[0].length ?? 0);
    const end =
      body?.[1] === '{' ? closingIndex(code, bodyStart - 1) : code.indexOf('\n\n', bodyStart);
    const uses = new RegExp(String.raw`(?<![\w.])${escapeRegExp(groups['name'] ?? '')}\b`, 'g');
    return [...code.slice(bodyStart, end === -1 ? code.length : end).matchAll(uses)].map((use) => ({
      from: bodyStart + use.index,
      to: bodyStart + use.index + use[0].length,
      header,
      kind: 'header',
    }));
  });
}

function functionStart(code: string, offset: number): number {
  const starts = [...code.slice(0, offset).matchAll(/\bfun\b/g)];
  return starts.at(-1)?.index ?? 0;
}

export function httpSources(scanned: Scanned): HttpSource[] {
  const direct = directSources(scanned);
  return [
    ...direct,
    ...direct.flatMap((source) => localReferences(scanned.code, source)),
    ...parameterReferences(scanned),
  ];
}
