import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

const BINDINGS = new Set(['web-tree-sitter', 'tree-sitter']);
const GRAMMAR_PACKAGE = /^((?:@[\w.-]+\/)?tree-sitter-[\w-]+)(?:\/.*)?$/u;
const WASM_NAME = /tree-sitter-([\w-]+)\.wasm/u;

export type ModuleSource = { readonly value: string; readonly node: TSESTree.Node };

export function sourceOf(node: TSESTree.Node): string | undefined {
  if (
    node.type === AST_NODE_TYPES.ImportDeclaration ||
    node.type === AST_NODE_TYPES.ImportExpression
  ) {
    const { source } = node;
    return source.type === AST_NODE_TYPES.Literal && typeof source.value === 'string'
      ? source.value
      : undefined;
  }
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'require'
  ) {
    const [first] = node.arguments;
    return first?.type === AST_NODE_TYPES.Literal && typeof first.value === 'string'
      ? first.value
      : undefined;
  }
  return undefined;
}

export function stringText(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value;
  }
  if (node.type === AST_NODE_TYPES.TemplateElement) {
    return node.value.cooked ?? undefined;
  }
  return undefined;
}

export function isTreeSitterBinding(source: string): boolean {
  return BINDINGS.has(source);
}

export function grammarPackagesIn(text: string, source: boolean): string[] {
  if (source) {
    const match = GRAMMAR_PACKAGE.exec(text);
    return match?.[1] === undefined ? [] : [match[1]];
  }
  const wasm = WASM_NAME.exec(text)?.[1];
  if (wasm === undefined) {
    return [];
  }
  return [...new Set([`tree-sitter-${wasm}`, `tree-sitter-${wasm.replaceAll('_', '-')}`])];
}
