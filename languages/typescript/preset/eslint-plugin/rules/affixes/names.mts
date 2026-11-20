import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

import { wordsOf as untypedWords } from '../../../../../../shared/naming/name-words.mjs';

export const wordsOf: (name: string) => string[] = untypedWords;
const PENULTIMATE = -2;
const DIRECTORY_WORDS = new Set([
  'path',
  'pathname',
  'dir',
  'dirname',
  'directory',
  'folder',
  'root',
  'base',
  'route',
  'pkg',
  'cwd',
  'home',
  'homedir',
  'tmpdir',
]);
const HOST_WORDS = new Set(['domain', 'host', 'hostname', 'origin']);
const LOCATION_WORDS = new Set([
  ...DIRECTORY_WORDS,
  ...HOST_WORDS,
  'url',
  'href',
  'uri',
  'specifier',
  'importer',
  'filename',
]);

export function nameText(node: TSESTree.Node): string | undefined {
  const pending = [node];
  for (const item of pending) {
    if (item.type === AST_NODE_TYPES.Identifier) {
      return item.name;
    }
    if (item.type === AST_NODE_TYPES.MemberExpression) {
      return item.computed || item.property.type !== AST_NODE_TYPES.Identifier
        ? undefined
        : item.property.name;
    }
    if (item.type === AST_NODE_TYPES.CallExpression) {
      pending.push(item.callee);
    } else if (
      item.type === AST_NODE_TYPES.ChainExpression ||
      item.type === AST_NODE_TYPES.TSNonNullExpression ||
      item.type === AST_NODE_TYPES.TSAsExpression
    ) {
      pending.push(item.expression);
    } else {
      return undefined;
    }
  }
  return undefined;
}

function nameHas(node: TSESTree.Node, words: ReadonlySet<string>): boolean {
  const name = nameText(node);
  if (name === undefined) {
    return false;
  }
  const parts = wordsOf(name);
  const last = parts.at(-1) ?? '';
  return words.has(last) || (last === 'name' && parts.at(PENULTIMATE) === 'package');
}

export function isDirectoryName(node: TSESTree.Node): boolean {
  return nameHas(node, DIRECTORY_WORDS);
}

export function isHostName(node: TSESTree.Node): boolean {
  return nameHas(node, HOST_WORDS);
}

export function isLocationName(node: TSESTree.Node): boolean {
  return nameHas(node, LOCATION_WORDS);
}

export function isPrefixName(node: TSESTree.Node): boolean {
  return nameText(node)?.toLowerCase() === 'prefix';
}
