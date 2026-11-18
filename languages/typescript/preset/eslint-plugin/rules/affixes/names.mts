import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

import { wordsOf as untypedWords } from '../../../../../../shared/naming/name-words.mjs';

export const wordsOf: (name: string) => string[] = untypedWords;
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
  switch (node.type) {
    case AST_NODE_TYPES.Identifier:
      return node.name;
    case AST_NODE_TYPES.MemberExpression:
      return node.computed || node.property.type !== AST_NODE_TYPES.Identifier
        ? undefined
        : node.property.name;
    case AST_NODE_TYPES.CallExpression:
      return nameText(node.callee);
    case AST_NODE_TYPES.ChainExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSAsExpression:
      return nameText(node.expression);
    default:
      return undefined;
  }
}

function nameHas(node: TSESTree.Node, words: ReadonlySet<string>): boolean {
  const name = nameText(node);
  if (name === undefined) {
    return false;
  }
  const parts = wordsOf(name);
  const last = parts.at(-1) ?? '';
  return words.has(last) || (last === 'name' && parts.at(-2) === 'package');
}

export const isDirectoryName = (node: TSESTree.Node): boolean => nameHas(node, DIRECTORY_WORDS);
export const isHostName = (node: TSESTree.Node): boolean => nameHas(node, HOST_WORDS);
export const isLocationName = (node: TSESTree.Node): boolean => nameHas(node, LOCATION_WORDS);
export const isPrefixName = (node: TSESTree.Node): boolean =>
  nameText(node)?.toLowerCase() === 'prefix';
