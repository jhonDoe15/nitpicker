import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { readLayout } from '../../typed/policy-views.mts';
import { ancestorsOf, scopeChain, type SourceCode } from '../../typed/node-views.mts';
import { teardownFix } from '../../../fixes/processes/container-teardown-fix.mts';
import { fixable } from '../../../fixes/support/descriptors.mts';

const { isTestFixture } = readLayout();

function isContainerName(name: string): boolean {
  return /container|agent/i.test(name);
}

const CONTAINER_TYPE = /Started\w*Container|TestAgent/;

function hasContainerType(sourceCode: SourceCode, identifier: TSESTree.Identifier): boolean {
  for (const scope of scopeChain(sourceCode.getScope(identifier))) {
    const variable = scope.set.get(identifier.name);
    if (!variable) {
      continue;
    }
    return variable.defs.some((def) => {
      const annotation = 'typeAnnotation' in def.name ? def.name.typeAnnotation : undefined;
      return annotation !== undefined && CONTAINER_TYPE.test(sourceCode.getText(annotation));
    });
  }
  return false;
}

function isContainerExpression(node: TSESTree.Node, sourceCode: SourceCode): boolean {
  return (
    (node.type === AST_NODE_TYPES.Identifier &&
      (isContainerName(node.name) || hasContainerType(sourceCode, node))) ||
    (node.type === AST_NODE_TYPES.MemberExpression &&
      !node.computed &&
      isContainerName(node.property.name))
  );
}

export const rule: TSESLint.RuleModule<'unboundedStop'> = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: {
      unboundedStop:
        'Stop containers through teardownContainer rather than directly in teardown hooks.',
    },
  },
  create(context) {
    if (isTestFixture(context.filename, 'container-teardown.ts')) {
      return {};
    }
    return {
      CallExpression(node) {
        const callee =
          node.callee.type === AST_NODE_TYPES.ChainExpression
            ? node.callee.expression
            : node.callee;
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.computed ||
          callee.property.name !== 'stop' ||
          !isContainerExpression(callee.object, context.sourceCode)
        ) {
          return;
        }
        for (const current of ancestorsOf(node)) {
          if (current.type !== AST_NODE_TYPES.CallExpression) {
            continue;
          }
          if (
            current.callee.type === AST_NODE_TYPES.Identifier &&
            ['afterAll', 'afterEach'].includes(current.callee.name) &&
            current.arguments.some(
              (argument) =>
                [
                  AST_NODE_TYPES.ArrowFunctionExpression,
                  AST_NODE_TYPES.FunctionExpression,
                ].includes(argument.type) &&
                argument.range[0] <= node.range[0] &&
                node.range[1] <= argument.range[1],
            )
          ) {
            context.report(
              fixable(
                { node, messageId: 'unboundedStop' },
                teardownFix(context.sourceCode, node, callee),
              ),
            );
            return;
          }
        }
      },
    };
  },
};
