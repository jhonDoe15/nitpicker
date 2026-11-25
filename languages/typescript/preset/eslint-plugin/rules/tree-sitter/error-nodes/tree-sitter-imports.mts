import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { depthFirst, nodeChildren, requiredLiteral } from '../../typed/node-views.mts';

const TREE_SITTER_PACKAGES = ['web-tree-sitter', 'tree-sitter', 'node-tree-sitter'];

function isTreeSitterPackage(specifier: unknown): boolean {
  if (typeof specifier !== 'string') {
    return false;
  }
  return TREE_SITTER_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`));
}

function importSpecifierOf(node: TSESTree.Node): unknown {
  if (node.type === AST_NODE_TYPES.ImportDeclaration) {
    return node.source.value;
  }
  if (node.type === AST_NODE_TYPES.ImportExpression) {
    return node.source.type === AST_NODE_TYPES.Literal ? node.source.value : undefined;
  }
  if (
    node.type === AST_NODE_TYPES.TSImportEqualsDeclaration &&
    node.moduleReference.type === AST_NODE_TYPES.TSExternalModuleReference
  ) {
    return node.moduleReference.expression.value;
  }
  return requiredLiteral(node);
}

export function importsTreeSitter(program: TSESTree.Program): boolean {
  for (const node of depthFirst<TSESTree.Node>(program, nodeChildren)) {
    if (isTreeSitterPackage(importSpecifierOf(node))) {
      return true;
    }
  }
  return false;
}
