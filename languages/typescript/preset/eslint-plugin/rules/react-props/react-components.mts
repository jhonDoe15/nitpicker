import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isComponentName as untypedIsComponentName } from '../../../syntax/component-names.mjs';
import { nameOf } from '../typed/node-views.mts';
import type { FunctionNode } from '../react/react-effects.mts';

export type ComponentFrame = {
  readonly node: FunctionNode;
  returnsJsx: boolean;
  readonly ifs: TSESTree.IfStatement[];
};
type NamedDeclarator = TSESTree.VariableDeclarator & { readonly id: TSESTree.Identifier };

const isComponentName: (name: string | undefined) => boolean = untypedIsComponentName;

const COMPONENT_WRAPPERS = new Set<string | undefined>(['memo', 'forwardRef']);

function calleeName(callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return 'property' in callee ? nameOf(callee.property) : undefined;
}

function isWrapperCall(node: TSESTree.Node | undefined): node is TSESTree.CallExpression {
  return (
    node?.type === AST_NODE_TYPES.CallExpression && COMPONENT_WRAPPERS.has(calleeName(node.callee))
  );
}

function isNamedDeclarator(node: TSESTree.Node | undefined): node is NamedDeclarator {
  return (
    node?.type === AST_NODE_TYPES.VariableDeclarator && node.id.type === AST_NODE_TYPES.Identifier
  );
}

export function declaratorOf(fn: FunctionNode): NamedDeclarator | undefined {
  const parent = isWrapperCall(fn.parent) ? fn.parent.parent : fn.parent;
  return isNamedDeclarator(parent) ? parent : undefined;
}

function functionName(fn: FunctionNode): string | undefined {
  return fn.id?.name ?? declaratorOf(fn)?.id.name;
}

function isJsxValue(expression: TSESTree.Node | undefined): boolean {
  const pending = [expression];
  for (const node of pending) {
    if (node?.type === AST_NODE_TYPES.JSXElement || node?.type === AST_NODE_TYPES.JSXFragment) {
      return true;
    }
    if (node?.type === AST_NODE_TYPES.ConditionalExpression) {
      pending.push(node.consequent, node.alternate);
    }
    if (node?.type === AST_NODE_TYPES.LogicalExpression) {
      pending.push(node.left, node.right);
    }
  }
  return false;
}

export function componentVisitor(
  onComponent: (frame: ComponentFrame) => void,
): TSESLint.RuleListener {
  const frames: ComponentFrame[] = [];
  function enter(node: FunctionNode): void {
    frames.push({
      node,
      returnsJsx: node.body.type !== AST_NODE_TYPES.BlockStatement && isJsxValue(node.body),
      ifs: [],
    });
  }
  function exit(node: FunctionNode): void {
    const frame = frames.pop();
    if (frame?.returnsJsx === true && isComponentName(functionName(node))) {
      onComponent(frame);
    }
  }
  return {
    FunctionDeclaration: enter,
    'FunctionDeclaration:exit': exit,
    FunctionExpression: enter,
    'FunctionExpression:exit': exit,
    ArrowFunctionExpression: enter,
    'ArrowFunctionExpression:exit': exit,
    ReturnStatement(node: TSESTree.ReturnStatement) {
      const frame = frames.at(-1);
      if (frame !== undefined && isJsxValue(node.argument ?? undefined)) {
        frame.returnsJsx = true;
      }
    },
    IfStatement(node: TSESTree.IfStatement) {
      frames.at(-1)?.ifs.push(node);
    },
  };
}
