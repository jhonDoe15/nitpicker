import { readLayout } from '../../head-policy.mjs';
import { ancestorsOf, scopeChain } from './ancestry.mjs';

const layout = readLayout();

function isContainerName(name) {
  return /container|agent/i.test(name);
}

const CONTAINER_TYPE = /Started\w*Container|TestAgent/;

function hasContainerType(sourceCode, identifier) {
  for (const scope of scopeChain(sourceCode.getScope(identifier))) {
    const variable = scope.set.get(identifier.name);
    if (!variable) continue;
    return variable.defs.some((def) => {
      const annotation = def.name.typeAnnotation;
      return annotation !== undefined && CONTAINER_TYPE.test(sourceCode.getText(annotation));
    });
  }
  return false;
}

function isContainerExpression(node, sourceCode) {
  return (
    (node.type === 'Identifier' &&
      (isContainerName(node.name) || hasContainerType(sourceCode, node))) ||
    (node.type === 'MemberExpression' && !node.computed && isContainerName(node.property.name))
  );
}

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      unboundedStop:
        'Stop containers through teardownContainer rather than directly in teardown hooks.',
    },
  },
  create(context) {
    if (layout.isTestFixture(context.filename, 'container-teardown.ts')) return {};
    return {
      CallExpression(node) {
        const callee =
          node.callee.type === 'ChainExpression' ? node.callee.expression : node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          callee.property.name !== 'stop' ||
          !isContainerExpression(callee.object, context.sourceCode)
        )
          return;
        for (const current of ancestorsOf(node)) {
          if (current.type !== 'CallExpression') continue;
          if (
            current.callee.type === 'Identifier' &&
            ['afterAll', 'afterEach'].includes(current.callee.name) &&
            current.arguments.some(
              (argument) =>
                ['ArrowFunctionExpression', 'FunctionExpression'].includes(argument.type) &&
                argument.range[0] <= node.range[0] &&
                node.range[1] <= argument.range[1],
            )
          ) {
            context.report({ node, messageId: 'unboundedStop' });
            return;
          }
        }
      },
    };
  },
};
