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

export function percent(covered, total) {
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
    identity: hashIdentity('cov', [rule, path, symbol]),
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

const XML_TOKENS =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>|<(\/?)([^\s/>]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi;

function closeElement(stack, name) {
  if (stack.length === 1 || stack.at(-1).name !== name) {
    throw new TypeError(`XML closing tag </${name}> does not match an open element`);
  }
  stack.pop();
}

function openElement(stack, { name, rest, selfClosing }) {
  const element = { name, attrs: parseAttributes(rest), children: [], text: '' };
  stack.at(-1).children.push(element);
  if (selfClosing !== '/') {
    stack.push(element);
  }
}

function collectText(element, gap, token) {
  element.text += decodeEntities(gap) + cdataOf(token);
}

function documentElementOf(root, stack) {
  if (stack.length !== 1) {
    throw new TypeError(`XML element <${stack.at(-1).name}> is not closed`);
  }
  if (root.children.length === 0) {
    throw new TypeError('XML document has no root element');
  }
  return root.children[0];
}

export function parseXml(text) {
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  let textStart = 0;
  for (const match of text.matchAll(XML_TOKENS)) {
    const [token, closing, name, rest, selfClosing] = match;
    collectText(stack.at(-1), text.slice(textStart, match.index), token);
    textStart = match.index + token.length;
    if (name === undefined) {
      continue;
    }
    if (closing === '/') {
      closeElement(stack, name);
    } else {
      openElement(stack, { name, rest, selfClosing });
    }
  }
  return documentElementOf(root, stack);
}

function cdataOf(token) {
  return token.startsWith('<![CDATA[') ? token.slice('<![CDATA['.length, -']]>'.length) : '';
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

export function descendantsNamed(element, name) {
  return element.children.flatMap((child) => [
    ...(child.name === name ? [child] : []),
    ...descendantsNamed(child, name),
  ]);
}
