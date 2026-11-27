import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { optionalText } from '../../../../../../shared/values/readers.mts';

const BINDINGS = new Set(['web-tree-sitter', 'tree-sitter']);
const GRAMMAR_PACKAGE = /^((?:@[\w.-]+\/)?tree-sitter-[\w-]+)(?:\/.*)?$/u;
const WASM_NAME = /tree-sitter-([\w-]+)\.wasm/u;

function literalSource(node: TSESTree.Node | undefined): string | undefined {
  return node?.type === AST_NODE_TYPES.Literal ? optionalText(node.value) : undefined;
}

export function sourceOf(node: TSESTree.Node): string | undefined {
  if (
    node.type === AST_NODE_TYPES.ImportDeclaration ||
    node.type === AST_NODE_TYPES.ImportExpression
  ) {
    return literalSource(node.source);
  }
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'require'
  ) {
    return literalSource(node.arguments[0]);
  }
  return undefined;
}

export function stringText(node: TSESTree.Literal | TSESTree.TemplateElement): string | undefined {
  return node.type === AST_NODE_TYPES.Literal
    ? optionalText(node.value)
    : optionalText(node.value.cooked);
}

export function isTreeSitterBinding(source: string): boolean {
  return BINDINGS.has(source);
}

export function grammarPackagesInSource(text: string): string[] {
  const match = GRAMMAR_PACKAGE.exec(text);
  return match?.[1] === undefined ? [] : [match[1]];
}

export function grammarPackagesInWasm(text: string): string[] {
  const wasm = WASM_NAME.exec(text)?.[1];
  if (wasm === undefined) {
    return [];
  }
  return [...new Set([`tree-sitter-${wasm}`, `tree-sitter-${wasm.replaceAll('_', '-')}`])];
}
