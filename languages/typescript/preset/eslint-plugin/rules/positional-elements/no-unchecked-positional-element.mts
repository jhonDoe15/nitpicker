import path from 'node:path';
import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';
import { enclosingFunction, type FunctionNode } from '../typed/syntax-views.mts';

const PLAIN_SCRIPTS = new Set(['.js', '.mjs', '.cjs']);
const ITERATORS = new Set(['map', 'flatMap', 'forEach', 'filter']);
const GUARD_OPERATORS = new Set(['===', '!==', '==', '!=']);

function isCallback(fn: FunctionNode): fn is FunctionNode & { parent: TSESTree.CallExpression } {
  const { parent } = fn;
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments[0] === fn &&
    parent.callee.type === AST_NODE_TYPES.MemberExpression &&
    !parent.callee.computed &&
    ITERATORS.has(nameOf(parent.callee.property) ?? '')
  );
}

function memberRootName(node: TSESTree.Node): string | undefined {
  let current = node;
  while (current.type === AST_NODE_TYPES.MemberExpression && !current.optional) {
    current = current.object;
  }
  return current === node || current.type !== AST_NODE_TYPES.Identifier ? undefined : current.name;
}

function parameterNames(fn: FunctionNode): Set<string> {
  return new Set(
    fn.params.flatMap((param) => {
      const name = param.type === AST_NODE_TYPES.Identifier ? param.name : undefined;
      return name === undefined ? [] : [name];
    }),
  );
}

function arrayPatternsOf(fn: FunctionNode): TSESTree.ArrayPattern[] {
  const found: TSESTree.ArrayPattern[] = [];
  const visitProperties = (pattern: TSESTree.ObjectPattern): void => {
    for (const property of pattern.properties) {
      if (property.type !== AST_NODE_TYPES.Property) {
        continue;
      }
      if (property.value.type === AST_NODE_TYPES.ArrayPattern) {
        found.push(property.value);
      } else if (property.value.type === AST_NODE_TYPES.ObjectPattern) {
        visitProperties(property.value);
      }
    }
  };
  for (const param of fn.params) {
    if (param.type === AST_NODE_TYPES.ObjectPattern) {
      visitProperties(param);
    }
  }
  const [first] = fn.params;
  if (first?.type === AST_NODE_TYPES.ArrayPattern && isCallback(fn) && fromParameter(fn)) {
    found.push(first);
  }
  return found;
}

function fromParameter(fn: FunctionNode & { parent: TSESTree.CallExpression }): boolean {
  const { callee } = fn.parent;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const owner = enclosingFunction(fn);
  const root = memberRootName(callee.object);
  return owner !== undefined && root !== undefined && parameterNames(owner).has(root);
}

function isTuple(fn: FunctionNode, sourceCode: Readonly<TSESLint.SourceCode>): boolean {
  for (
    let current: TSESTree.Node = fn;
    current.type !== AST_NODE_TYPES.Program;
    current = current.parent
  ) {
    if (
      sourceCode.getCommentsBefore(current).some((comment) => /(?:\{|:)\s*\[/u.test(comment.value))
    ) {
      return true;
    }
  }
  return false;
}

function isGuard(reference: TSESTree.Node): boolean {
  const { parent } = reference;
  if (parent === undefined) {
    return false;
  }
  switch (parent.type) {
    case AST_NODE_TYPES.IfStatement:
    case AST_NODE_TYPES.ConditionalExpression:
      return parent.test === reference;
    case AST_NODE_TYPES.LogicalExpression:
    case AST_NODE_TYPES.UnaryExpression:
    case AST_NODE_TYPES.AssignmentPattern:
      return true;
    case AST_NODE_TYPES.BinaryExpression:
      return GUARD_OPERATORS.has(parent.operator);
    case AST_NODE_TYPES.MemberExpression:
      return parent.object === reference && parent.optional;
    case AST_NODE_TYPES.CallExpression:
      return parent.callee === reference && parent.optional;
    default:
      return false;
  }
}

function isUnchecked(reference: TSESTree.Node): boolean {
  const { parent } = reference;
  if (parent === undefined) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.MemberExpression) {
    return parent.object === reference && !parent.optional;
  }
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.includes(reference as TSESTree.CallExpressionArgument)
  );
}

export const rule: TSESLint.RuleModule<'uncheckedElement'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow unchecked array elements taken from a parameter in untyped JavaScript',
    },
    schema: [],
    messages: {
      uncheckedElement:
        'The element "{{name}}" is taken from an array of a parameter by position and used without a test. The function does not control the length of that array, so the element can be undefined (a converted parser error node, a missing child) and the failure shows up later, far from the cause. Test it for undefined, give it a default, or skip the item.',
    },
  },
  create(context) {
    if (!PLAIN_SCRIPTS.has(path.extname(context.filename).toLowerCase())) {
      return {};
    }
    if (context.sourceCode.text.includes('@ts-check')) {
      return {};
    }
    const check = (fn: FunctionNode): void => {
      if (isTuple(fn, context.sourceCode)) {
        return;
      }
      for (const pattern of arrayPatternsOf(fn)) {
        for (const element of pattern.elements) {
          if (element?.type !== AST_NODE_TYPES.Identifier) {
            continue;
          }
          const variable = context.sourceCode
            .getDeclaredVariables(fn)
            .find((candidate) => candidate.name === element.name);
          const references =
            variable?.references.filter((reference) => reference.identifier !== element) ?? [];
          if (references.some((reference) => isGuard(reference.identifier))) {
            continue;
          }
          const use = references.find((reference) => isUnchecked(reference.identifier));
          if (use !== undefined) {
            context.report({
              node: use.identifier,
              messageId: 'uncheckedElement',
              data: { name: element.name },
            });
          }
        }
      }
    };
    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
};
