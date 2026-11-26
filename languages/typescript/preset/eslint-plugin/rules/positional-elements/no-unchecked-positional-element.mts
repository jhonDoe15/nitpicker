import path from 'node:path';
import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';
import { isCallback, isGuard, isUnchecked, returnedElementUse } from './positional-usage.mts';
import { enclosingFunction, type FunctionNode } from '../typed/syntax-views.mts';

const PLAIN_SCRIPTS = new Set(['.js', '.mjs', '.cjs']);
const TREE_LISTS = new Set(['children', 'namedChildren', 'childNodes']);

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

function isFixedShape(pattern: TSESTree.ArrayPattern): boolean {
  return pattern.elements.filter((element) => element !== null).length >= 2;
}

function plainMemberRoot(node: TSESTree.MemberExpression): string | undefined {
  let current: TSESTree.Node = node;
  while (current.type === AST_NODE_TYPES.MemberExpression) {
    if (current.computed || current.optional) {
      return undefined;
    }
    current = current.object;
  }
  return current.type === AST_NODE_TYPES.Identifier ? current.name : undefined;
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

function isTuple(start: TSESTree.Node, sourceCode: Readonly<TSESLint.SourceCode>): boolean {
  for (
    let current: TSESTree.Node = start;
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
    const { sourceCode } = context;
    const checkElements = (
      pattern: TSESTree.ArrayPattern,
      variables: readonly TSESLint.Scope.Variable[],
      fn: FunctionNode | undefined,
    ): void => {
      for (const element of pattern.elements) {
        if (element?.type !== AST_NODE_TYPES.Identifier) {
          continue;
        }
        const references =
          variables
            .find((candidate) => candidate.name === element.name)
            ?.references.filter((reference) => reference.identifier !== element) ?? [];
        if (references.some((reference) => isGuard(reference.identifier))) {
          continue;
        }
        const use =
          references.find((reference) => isUnchecked(reference.identifier))?.identifier ??
          (fn === undefined ? undefined : returnedElementUse(sourceCode, fn, references));
        if (use !== undefined) {
          context.report({
            node: use,
            messageId: 'uncheckedElement',
            data: { name: element.name },
          });
        }
      }
    };
    const check = (fn: FunctionNode): void => {
      if (isTuple(fn, sourceCode)) {
        return;
      }
      for (const pattern of arrayPatternsOf(fn)) {
        if (!isFixedShape(pattern)) {
          checkElements(pattern, sourceCode.getDeclaredVariables(fn), fn);
        }
      }
    };
    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
      VariableDeclarator(node) {
        const { id, init } = node;
        const owner = enclosingFunction(node);
        if (
          id.type !== AST_NODE_TYPES.ArrayPattern ||
          init?.type !== AST_NODE_TYPES.MemberExpression ||
          owner === undefined ||
          isTuple(node, sourceCode)
        ) {
          return;
        }
        const property = init.computed ? undefined : nameOf(init.property);
        const root = plainMemberRoot(init);
        if (
          root === undefined ||
          property === undefined ||
          !parameterNames(owner).has(root) ||
          (isFixedShape(id) && !TREE_LISTS.has(property))
        ) {
          return;
        }
        checkElements(id, sourceCode.getDeclaredVariables(node), undefined);
      },
    };
  },
};
