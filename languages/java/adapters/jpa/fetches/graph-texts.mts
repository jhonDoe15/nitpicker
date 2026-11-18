import { appendAll } from '../../../../../shared/lists/items.mjs';
import { closingOrEnd } from '../../../source/frames/bracket-depths.mts';
import type { GraphNode, Steps } from './fetch-types.mts';

const STRINGS = /"""([\s\S]*?)"""|"((?:\\.|[^"\\\n])*)"/gu;
const NODE = /@?\s*(?<![\w$])(?:[\w.]*\.)?NamedAttributeNode\s*\(([^()]*)\)/gu;
const SUBGRAPH = /(?<![\w$])(?:[\w.]*\.)?NamedSubgraph\s*\(/gu;
const SUBGRAPHS = /\bsubgraphs\s*=/u;
const LIST_CLOSE: Readonly<Record<string, string | undefined>> = { '{': '}', '[': ']' };
const STEP: Steps = { '(': 1, ')': -1 };
const MAX_SUBGRAPH_DEPTH = 3;
export const BRACES: Steps = { '{': 1, '}': -1 };

export function braceDepths(text: string): Int32Array {
  const depths = new Int32Array(text.length + 1);
  for (const [index, character] of Array.from(text).entries()) {
    depths[index + 1] = (depths[index] ?? 0) + (BRACES[character] ?? 0);
  }
  return depths;
}

export function closingOf(text: string, open: number, step: Steps): number {
  return closingOrEnd(text, open, step);
}

export function closingParen(text: string, open: number): number {
  return closingOf(text, open, STEP);
}

export function argumentsAt(text: string, start: number): string {
  const open = text.indexOf('(', start);
  return text.slice(open + 1, closingParen(text, open));
}

export function stringsIn(text: string): string[] {
  return [...text.matchAll(STRINGS)].map(([, block, plain]) => block ?? plain ?? '');
}

export function graphPaths(argumentsText: string): string[][] {
  const pairs = (argumentsText.split(/\battributePaths\s*=/u)[1] ?? '').trim();
  const close = LIST_CLOSE[pairs[0] ?? ''];
  const list =
    close === undefined
      ? (pairs.split(/,\s*[\w$]+\s*=/u)[0] ?? '')
      : pairs.slice(0, pairs.indexOf(close) + 1);
  return stringsIn(list).map((value) => value.split('.'));
}

function nodesIn(text: string): GraphNode[] {
  return [...text.matchAll(NODE)].map(([, inner = '']) => {
    const [name, subgraph] = [/(?:value\s*=\s*)?"([\w$]+)"/u, /subgraph\s*=\s*"([^"]+)"/u].map(
      (pattern) => pattern.exec(inner)?.[1],
    );
    return { name, subgraph };
  });
}

function subgraphsIn(text: string): Map<string | undefined, GraphNode[]> {
  return new Map(
    [...text.matchAll(SUBGRAPH)].map((match): [string | undefined, GraphNode[]] => {
      const inner = argumentsAt(text, match.index);
      return [/name\s*=\s*"([^"]+)"/u.exec(inner)?.[1], nodesIn(inner)];
    }),
  );
}

export function namedGraphPaths(argumentsText: string): string[][] {
  const [own = '', nested = ''] = argumentsText.split(SUBGRAPHS);
  const subgraphs = subgraphsIn(nested);
  const paths: (string | undefined)[][] = [];
  const pending: { node: GraphNode; prefix: (string | undefined)[]; depth: number }[] = nodesIn(
    own,
  ).map((node) => ({ node, prefix: [], depth: 0 }));
  for (const { node, prefix, depth } of pending) {
    const path = [...prefix, node.name];
    paths.push(path);
    const children = depth < MAX_SUBGRAPH_DEPTH ? (subgraphs.get(node.subgraph) ?? []) : [];
    appendAll(
      pending,
      children.map((child) => ({ node: child, prefix: path, depth: depth + 1 })),
    );
  }
  return paths.filter((path): path is string[] => path.every(Boolean));
}
