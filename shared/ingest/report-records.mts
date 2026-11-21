import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolveInside } from '../conventions/read-inside.mts';
import type { Finding } from '../values/findings.mts';
import type {
  LineIdentityInput,
  XmlClosing,
  XmlElement,
  XmlNode,
  XmlOpening,
  XmlScan,
  XmlStack,
} from './typed/xml-types.mts';

export type { XmlElement } from './typed/xml-types.mts';
export { normalizeReportPath } from './paths/report-path.mts';

export const IDENTITY_DIGEST_LENGTH = 16;
const PERCENT_SCALE = 10000;
const MAX_CODE_POINT = 0x10ffff;

export function hashIdentity(prefix: string, parts: readonly string[]): string {
  const digest = createHash('sha256')
    .update(parts.join('\0'))
    .digest('hex')
    .slice(0, IDENTITY_DIGEST_LENGTH);
  return `${prefix}:${digest}`;
}

export function createIdentityCounter(): (identity: string) => string {
  const seen = new Map<string, number>();
  return (identity: string): string => {
    const count = (seen.get(identity) ?? 0) + 1;
    seen.set(identity, count);
    return count === 1 ? identity : `${identity}#${String(count)}`;
  };
}

export { resolveInside as projectFile };

function projectLines(projectRoot: string, file: string): string[] {
  const absolute = resolveInside(projectRoot, file);
  return absolute !== undefined && existsSync(absolute)
    ? readFileSync(absolute, 'utf8').split(/\r?\n/u)
    : [];
}

export function createLineIdentity(
  prefix: string,
  projectRoot: string,
): (input: LineIdentityInput) => string {
  const sources = new Map<string, string[]>();
  const counters = new Map<string, (identity: string) => string>();
  function lineText(file: string, line: number): string {
    const lines = sources.get(file) ?? projectLines(projectRoot, file);
    sources.set(file, lines);
    return (lines[line - 1] ?? '').trim().replaceAll(/\s+/gu, ' ');
  }
  return ({ file, line, parts }) => {
    const counter = counters.get(file) ?? createIdentityCounter();
    counters.set(file, counter);
    const text = line === undefined ? '' : lineText(file, line);
    return counter(hashIdentity(prefix, [...parts, text]));
  };
}

function percent(covered: number, total: number): number {
  return Math.round((covered / total) * PERCENT_SCALE) / 100;
}

export function coverageMetricFinding({
  tool,
  path,
  name,
  covered,
  total,
}: {
  readonly tool: string;
  readonly path: string;
  readonly name: string;
  readonly covered: number;
  readonly total: number;
}): Finding {
  return {
    tool,
    rule: name,
    path,
    identity: name,
    message: `${name} ${String(percent(covered, total))}% (${String(covered)}/${String(total)})`,
    classification: 'descriptive',
    metric: { name, value: percent(covered, total) },
  };
}

export function uncoveredFinding({
  tool,
  rule,
  path,
  symbol,
  message,
}: {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly symbol: string;
  readonly message: string;
}): Finding {
  return {
    tool,
    rule,
    path,
    identity: `cov:${symbol}`,
    message,
    classification: 'descriptive',
    symbol,
  };
}

const ENTITIES: Readonly<Record<string, string | undefined>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole: string, body: string) => {
    if (body.startsWith('#x')) {
      return safeCodePoint(Number.parseInt(body.slice(2), 16), whole);
    }
    if (body.startsWith('#')) {
      return safeCodePoint(Number.parseInt(body.slice(1), 10), whole);
    }
    return ENTITIES[body] ?? whole;
  });
}

function safeCodePoint(codePoint: number, fallback: string): string {
  return codePoint > 0 && codePoint <= MAX_CODE_POINT ? String.fromCodePoint(codePoint) : fallback;
}

const XML_TOKEN_PARTS: readonly string[] = [
  String.raw`<!--[\s\S]*?-->`,
  String.raw`<!\[CDATA\[[\s\S]*?\]\]>`,
  String.raw`<\?[\s\S]*?\?>`,
  String.raw`<!DOCTYPE[^>[]*(?:\[[\s\S]*?\]\s*)?>`,
  String.raw`<(\/?)([^\s/>]+)((?:[\s/](?:[^>"']|"[^"]*"|'[^']*')*?)??)(\/?)>`,
];

export function parseXml(text: string): XmlElement {
  const tokens = new RegExp(XML_TOKEN_PARTS.join('|'), 'gi');
  const root: XmlNode = { name: '#document', attrs: {}, children: [] };
  const stack: XmlStack = [root];
  const contentStarts = new Map<XmlNode, number>();
  for (const match of text.matchAll(tokens)) {
    consumeXmlTag(match, { stack, text, contentStarts });
  }
  if (stack.length !== 1) {
    throw new TypeError(`XML element <${stack.at(-1)?.name ?? ''}> is not closed`);
  }
  const [documentElement] = root.children;
  if (documentElement === undefined) {
    throw new TypeError('XML document has no root element');
  }
  return documentElement;
}

function closeElement(stack: XmlStack, { name, text, end, contentStarts }: XmlClosing): void {
  const current = stack.at(-1);
  if (current === undefined || stack.length === 1 || current.name !== name) {
    throw new TypeError(`XML closing tag </${name}> does not match an open element`);
  }
  const content =
    current.children.length === 0 ? elementText(text.slice(contentStarts.get(current), end)) : '';
  if (content !== '') {
    current.text = content;
  }
  stack.pop();
}

function elementText(raw: string): string {
  return raw
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/u)
    .map((part) =>
      part.startsWith('<![CDATA[')
        ? part.slice('<![CDATA['.length, -']]>'.length)
        : decodeEntities(part.replace(/<!--[\s\S]*?-->/gu, '')),
    )
    .join('')
    .trim();
}

function openElement(
  stack: XmlStack,
  { name, rest, selfClosing, contentStart, contentStarts }: XmlOpening,
): void {
  const element: XmlNode = { name, attrs: parseAttributes(rest), children: [] };
  stack.at(-1)?.children.push(element);
  if (selfClosing !== '/') {
    contentStarts.set(element, contentStart);
    stack.push(element);
  }
}

function parseAttributes(source: string | undefined): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of (source ?? '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[match[1] ?? ''] = decodeEntities(match[2] ?? match[3] ?? '');
  }
  return attrs;
}

export function childrenNamed(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child) => child.name === name);
}

export function testCaseProblem(
  testCase: XmlElement,
  { flakyPasses }: { readonly flakyPasses: boolean } = { flakyPasses: false },
): { readonly problem: XmlElement; readonly flaky: boolean } | undefined {
  const failed = [...childrenNamed(testCase, 'failure'), ...childrenNamed(testCase, 'error')];
  const [failure] = failed;
  if (failure !== undefined) {
    return { problem: failure, flaky: false };
  }
  const flaky = [
    ...childrenNamed(testCase, 'flakyFailure'),
    ...childrenNamed(testCase, 'flakyError'),
  ];
  const [flakyProblem] = flaky;
  return flakyProblem !== undefined && !flakyPasses
    ? { problem: flakyProblem, flaky: true }
    : undefined;
}

export function childAt(
  element: XmlElement | undefined,
  ...names: readonly string[]
): XmlElement | undefined {
  return names.reduce<XmlElement | undefined>(
    (current, name) => current && childrenNamed(current, name)[0],
    element,
  );
}

export function childrenAt(
  element: XmlElement | undefined,
  ...names: readonly string[]
): XmlElement[] {
  const parent = childAt(element, ...names.slice(0, -1));
  return parent === undefined ? [] : childrenNamed(parent, names.at(-1) ?? '');
}

function consumeXmlTag(match: RegExpExecArray, { stack, text, contentStarts }: XmlScan): void {
  const [, closing, name, rest, selfClosing] = match;
  if (name === undefined) {
    return;
  }
  if (closing === '/') {
    closeElement(stack, { name, text, end: match.index, contentStarts });
    return;
  }
  openElement(stack, {
    name,
    rest,
    selfClosing,
    contentStart: match.index + match[0].length,
    contentStarts,
  });
}
