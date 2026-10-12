import { ancestorsOf, variableNamed } from './ancestry.mjs';
import { hookName, isEffectCallback, isFunctionNode } from './react-effects.mjs';

const SETTER_INDEX = 1;

function runsOnce(effectCall) {
  const dependencies = effectCall.arguments[1];
  return dependencies?.type === 'ArrayExpression' && dependencies.elements.length === 0;
}

function enclosingFunction(node) {
  return ancestorsOf(node).find(isFunctionNode);
}

function declaredName(fn) {
  if (fn.type === 'FunctionDeclaration') {
    return fn.id ?? undefined;
  }
  const declarator = fn.parent;
  return declarator.type === 'VariableDeclarator' &&
    declarator.init === fn &&
    declarator.id.type === 'Identifier'
    ? declarator.id
    : undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow setting state from an effect body, which derives state from props or state',
    },
    schema: [],
    messages: {
      derivedState:
        'Do not set state from an effect to mirror props or state. Compute the value during render (`const total = price * quantity;`). If this effect synchronizes with an external system, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function isUseStateCall(node) {
      return node?.type === 'CallExpression' && hookName(sourceCode, node.callee) === 'useState';
    }

    function isStateTuple(identifier) {
      return (
        variableNamed(sourceCode, identifier)?.defs.some(
          ({ node }) => node.type === 'VariableDeclarator' && isUseStateCall(node.init),
        ) ?? false
      );
    }

    function isSetterIndexAccess(init) {
      return (
        init?.type === 'MemberExpression' &&
        init.computed &&
        init.property.type === 'Literal' &&
        init.property.value === SETTER_INDEX &&
        init.object.type === 'Identifier' &&
        isStateTuple(init.object)
      );
    }

    function isStateSetterDefinition(definition) {
      const declarator = definition.node;
      if (declarator.type !== 'VariableDeclarator') {
        return false;
      }
      if (declarator.id.type === 'ArrayPattern') {
        return (
          declarator.id.elements[SETTER_INDEX] === definition.name &&
          isUseStateCall(declarator.init)
        );
      }
      return isSetterIndexAccess(declarator.init);
    }

    function isStateSetterCall(node) {
      return (
        node.callee.type === 'Identifier' &&
        (variableNamed(sourceCode, node.callee)?.defs.some(isStateSetterDefinition) ?? false)
      );
    }

    function isCalledSynchronouslyIn(fn, effect) {
      const name = declaredName(fn);
      const variable = name === undefined ? undefined : variableNamed(sourceCode, name);
      return (
        variable?.references.some(
          ({ identifier }) =>
            identifier.parent.type === 'CallExpression' &&
            identifier.parent.callee === identifier &&
            enclosingFunction(identifier.parent) === effect,
        ) ?? false
      );
    }

    function owningEffect(fn) {
      if (isEffectCallback(sourceCode, fn)) {
        return fn;
      }
      const outer = fn.async || fn.generator ? undefined : enclosingFunction(fn);
      return outer !== undefined &&
        isEffectCallback(sourceCode, outer) &&
        isCalledSynchronouslyIn(fn, outer)
        ? outer
        : undefined;
    }

    return {
      CallExpression(node) {
        if (!isStateSetterCall(node)) {
          return;
        }
        const fn = enclosingFunction(node);
        const effect = fn === undefined ? undefined : owningEffect(fn);
        if (effect !== undefined && !runsOnce(effect.parent)) {
          context.report({ node, messageId: 'derivedState' });
        }
      },
    };
  },
};
