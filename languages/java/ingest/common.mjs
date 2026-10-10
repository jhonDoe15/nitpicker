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

export function parseXml(text) {
  const tokens =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>|<(\/?)([^\s/>]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi;
  const root = { name: '#document', attrs: {}, children: [] };
  const stack = [root];
  for (const match of text.matchAll(tokens)) {
    const [, closing, name, rest, selfClosing] = match;
    if (name === undefined) {
      continue;
    }
    const current = stack.at(-1);
    if (closing === '/') {
      if (stack.length === 1 || current.name !== name) {
        throw new TypeError(`XML closing tag </${name}> does not match an open element`);
      }
      stack.pop();
      continue;
    }
    const element = { name, attrs: parseAttributes(rest), children: [] };
    current.children.push(element);
    if (selfClosing !== '/') {
      stack.push(element);
    }
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
