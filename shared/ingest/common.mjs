import { createHash } from 'node:crypto';

export function hashIdentity(prefix, parts) {
  const digest = createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 16);
  return `${prefix}:${digest}`;
}

export function normalizeReportPath(value, root) {
  let candidate = String(value).replaceAll('\\', '/');
  if (root !== undefined) {
    const prefix = `${String(root).replaceAll('\\', '/').replace(/\/+$/, '')}/`;
    if (candidate.startsWith(prefix)) {
      candidate = candidate.slice(prefix.length);
    }
  }
  candidate = candidate.replace(/^(\.\/)+/, '');
  if (
    candidate === '' ||
    candidate.includes('\0') ||
    /^(\/|[A-Za-z]:\/|\.\.(\/|$))/.test(candidate)
  ) {
    return undefined;
  }
  return candidate;
}

export function createIdentityCounter() {
  const seen = new Map();
  return (identity) => {
    const count = (seen.get(identity) ?? 0) + 1;
    seen.set(identity, count);
    return count === 1 ? identity : `${identity}#${String(count)}`;
  };
}

function percent(covered, total) {
  return Math.round((covered / total) * 10000) / 100;
}

export function coverageMetricFinding({ tool, path, name, covered, total }) {
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

export function uncoveredFinding({ tool, rule, path, symbol, message }) {
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

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body.startsWith('#x')) {
      return safeCodePoint(Number.parseInt(body.slice(2), 16), whole);
    }
    if (body.startsWith('#')) {
      return safeCodePoint(Number.parseInt(body.slice(1), 10), whole);
    }
    return ENTITIES[body] ?? whole;
  });
}

function safeCodePoint(codePoint, fallback) {
  return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : fallback;
}

const XML_TOKEN_PARTS = [
  String.raw`<!--[\s\S]*?-->`,
  String.raw`<!\[CDATA\[[\s\S]*?\]\]>`,
  String.raw`<\?[\s\S]*?\?>`,
  String.raw`<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>`,
  String.raw`<(\/?)([^\s/>]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>`,
];

export function parseXml(text) {
  const tokens = new RegExp(XML_TOKEN_PARTS.join('|'), 'gi');
  const root = { name: '#document', attrs: {}, children: [] };
  const stack = [root];
  const contentStarts = new Map();
  for (const match of text.matchAll(tokens)) {
    consumeXmlTag(match, { stack, text, contentStarts });
  }
  if (stack.length !== 1) {
    throw new TypeError(`XML element <${stack.at(-1).name}> is not closed`);
  }
  const [documentElement] = root.children;
  if (documentElement === undefined) {
    throw new TypeError('XML document has no root element');
  }
  return documentElement;
}

function closeElement(stack, { name, text, end, contentStarts }) {
  const current = stack.at(-1);
  if (stack.length === 1 || current.name !== name) {
    throw new TypeError(`XML closing tag </${name}> does not match an open element`);
  }
  const content =
    current.children.length === 0 ? elementText(text.slice(contentStarts.get(current), end)) : '';
  if (content !== '') {
    current.text = content;
  }
  stack.pop();
}

function elementText(raw) {
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

function openElement(stack, { name, rest, selfClosing, contentStart, contentStarts }) {
  const element = { name, attrs: parseAttributes(rest), children: [] };
  stack.at(-1).children.push(element);
  if (selfClosing !== '/') {
    contentStarts.set(element, contentStart);
    stack.push(element);
  }
}

function parseAttributes(source) {
  const attrs = {};
  for (const match of source.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[match[1]] = decodeEntities(match[2] ?? match[3]);
  }
  return attrs;
}

export function childrenNamed(element, name) {
  return element.children.filter((child) => child.name === name);
}

export function childAt(element, ...names) {
  return names.reduce((current, name) => current && childrenNamed(current, name)[0], element);
}

export function childrenAt(element, ...names) {
  const parent = childAt(element, ...names.slice(0, -1));
  return parent === undefined ? [] : childrenNamed(parent, names.at(-1));
}

function consumeXmlTag(match, { stack, text, contentStarts }) {
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
