const STRINGS = /"""([\s\S]*?)"""|"((?:\\.|[^"\\\n])*)"/gu;
const NODE = /@?\s*(?<![\w$])(?:[\w.]*\.)?NamedAttributeNode\s*\(([^()]*)\)/gu;
const SUBGRAPH = /(?<![\w$])(?:[\w.]*\.)?NamedSubgraph\s*\(/gu;
const SUBGRAPHS = /\bsubgraphs\s*=/u;
const LIST_CLOSE = { '{': '}', '[': ']' };
const STEP = { '(': 1, ')': -1 };
const MAX_SUBGRAPH_DEPTH = 3;
export const BRACES = { '{': 1, '}': -1 };

export function closingOf(text, open, step) {
  let depth = 0;
  for (const [offset, character] of [...text.slice(open)].entries()) {
    depth += step[character] ?? 0;
    if (depth === 0) {
      return open + offset;
    }
  }
  return text.length;
}

export function closingParen(text, open) {
  return closingOf(text, open, STEP);
}

export function argumentsAt(text, start) {
  const open = text.indexOf('(', start);
  return text.slice(open + 1, closingParen(text, open));
}

export function stringsIn(text) {
  return [...text.matchAll(STRINGS)].map(([, block, plain]) => block ?? plain);
}

export function graphPaths(argumentsText) {
  const pairs = (argumentsText.split(/\battributePaths\s*=/u)[1] ?? '').trim();
  const close = LIST_CLOSE[pairs[0]];
  const list =
    close === undefined
      ? pairs.split(/,\s*[\w$]+\s*=/u)[0]
      : pairs.slice(0, pairs.indexOf(close) + 1);
  return stringsIn(list).map((value) => value.split('.'));
}

function nodesIn(text) {
  return [...text.matchAll(NODE)].map(([, inner]) => {
    const [name, subgraph] = [/(?:value\s*=\s*)?"([\w$]+)"/u, /subgraph\s*=\s*"([^"]+)"/u].map(
      (pattern) => pattern.exec(inner)?.[1],
    );
    return { name, subgraph };
  });
}

function subgraphsIn(text) {
  return new Map(
    [...text.matchAll(SUBGRAPH)].map((match) => {
      const inner = argumentsAt(text, match.index);
      return [/name\s*=\s*"([^"]+)"/u.exec(inner)?.[1], nodesIn(inner)];
    }),
  );
}

export function namedGraphPaths(argumentsText) {
  const [own, nested = ''] = argumentsText.split(SUBGRAPHS);
  const subgraphs = subgraphsIn(nested);
  const paths = [];
  const pending = nodesIn(own).map((node) => ({ node, prefix: [], depth: 0 }));
  for (const { node, prefix, depth } of pending) {
    const path = [...prefix, node.name];
    paths.push(path);
    const children = depth < MAX_SUBGRAPH_DEPTH ? (subgraphs.get(node.subgraph) ?? []) : [];
    pending.push(...children.map((child) => ({ node: child, prefix: path, depth: depth + 1 })));
  }
  return paths.filter((path) => path.every(Boolean));
}
