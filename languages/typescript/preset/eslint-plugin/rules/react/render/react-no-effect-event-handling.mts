import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  ancestorsOf,
  constantInitializer,
  nameOf,
  variableNamed,
  type SourceCode,
} from '../../typed/node-views.mts';
import { hookName, isEffectCallback, isFunctionNode } from '../react-effects.mts';

type Definition = TSESLint.Scope.Definition;
const { DefinitionType } = TSESLint.Scope;

const callbackName = /^on[A-Z]/u;
const hookFunctionName = /^use[A-Z0-9]/u;

function isParameter(sourceCode: SourceCode, identifier: TSESTree.Identifier): boolean {
  return (
    variableNamed(sourceCode, identifier)?.defs.some(
      ({ type }) => type === DefinitionType.Parameter,
    ) ?? false
  );
}

function isDestructuredFromParameter(sourceCode: SourceCode, definition: Definition): boolean {
  return (
    definition.type === DefinitionType.Variable &&
    definition.node.id.type === AST_NODE_TYPES.ObjectPattern &&
    definition.node.init?.type === AST_NODE_TYPES.Identifier &&
    isParameter(sourceCode, definition.node.init)
  );
}

function isPropDefinition(sourceCode: SourceCode, definition: Definition): boolean {
  return (
    definition.type === DefinitionType.Parameter ||
    isDestructuredFromParameter(sourceCode, definition)
  );
}

function destructuredKey(binding: TSESTree.Identifier): string {
  const target =
    binding.parent.type === AST_NODE_TYPES.AssignmentPattern ? binding.parent : binding;
  const property = target.parent;
  return property.type === AST_NODE_TYPES.Property &&
    property.value === target &&
    !property.computed &&
    property.key.type === AST_NODE_TYPES.Identifier
    ? property.key.name
    : binding.name;
}

function propDefinition(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
): Definition | undefined {
  return variableNamed(sourceCode, identifier)?.defs.find((candidate) =>
    isPropDefinition(sourceCode, candidate),
  );
}

function functionName(fn: TSESTree.Node): string | undefined {
  const id = 'id' in fn ? fn.id : undefined;
  if (id) {
    return nameOf(id);
  }
  return fn.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    fn.parent.id.type === AST_NODE_TYPES.Identifier
    ? fn.parent.id.name
    : undefined;
}

function ownerFunction(sourceCode: SourceCode, definition: Definition): TSESTree.Node | undefined {
  if (definition.type === DefinitionType.Parameter) {
    return definition.node;
  }
  return definition.type === DefinitionType.Variable &&
    definition.node.init?.type === AST_NODE_TYPES.Identifier
    ? variableNamed(sourceCode, definition.node.init)?.defs.at(0)?.node
    : undefined;
}

function isHookInput(sourceCode: SourceCode, definition: Definition): boolean {
  const owner = ownerFunction(sourceCode, definition);
  return owner !== undefined && hookFunctionName.test(functionName(owner) ?? '');
}

function isCallbackProp(sourceCode: SourceCode, definition: Definition): boolean {
  return (
    (definition.name.type === AST_NODE_TYPES.Identifier &&
      callbackName.test(destructuredKey(definition.name))) ||
    !isHookInput(sourceCode, definition)
  );
}

function memberCallbackName(sourceCode: SourceCode, callee: TSESTree.Node): string | undefined {
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    callee.object.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const name = nameOf(callee.property);
  return name !== undefined &&
    callbackName.test(name) &&
    propDefinition(sourceCode, callee.object) !== undefined
    ? name
    : undefined;
}

function heldCallback(sourceCode: SourceCode, callee: TSESTree.Node): TSESTree.Node | undefined {
  const init =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    nameOf(callee.property) === 'current' &&
    callee.object.type === AST_NODE_TYPES.Identifier
      ? constantInitializer(sourceCode, callee.object)
      : undefined;
  if (
    init?.type !== AST_NODE_TYPES.CallExpression ||
    hookName(sourceCode, init.callee) !== 'useRef' ||
    init.arguments.length !== 1
  ) {
    return undefined;
  }
  const [argument] = init.arguments;
  return argument !== undefined && argument.type !== AST_NODE_TYPES.SpreadElement
    ? argument
    : undefined;
}

function propCallbackName(sourceCode: SourceCode, callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    const definition = propDefinition(sourceCode, callee);
    return definition !== undefined && isCallbackProp(sourceCode, definition)
      ? callee.name
      : undefined;
  }
  return memberCallbackName(sourceCode, callee);
}

function calledCallbackName(sourceCode: SourceCode, callee: TSESTree.Node): string | undefined {
  const held = heldCallback(sourceCode, callee);
  return held === undefined
    ? propCallbackName(sourceCode, callee)
    : propCallbackName(sourceCode, held);
}

function runsOnlyOnMount(effectCall: TSESTree.CallExpression): boolean {
  const dependencies = effectCall.arguments[1];
  return (
    dependencies?.type === AST_NODE_TYPES.ArrayExpression && dependencies.elements.length === 0
  );
}

export const rule: TSESLint.RuleModule<'effectEvent'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow calling a prop callback from an effect that reacts to a change',
    },
    schema: [],
    messages: {
      effectEvent:
        'Do not call `{{name}}` from an effect to react to a change: call it in the event handler that causes the change (`onSubmit` calls `onSave(value)`). An exception fits only when this effect synchronizes with an external system.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const name = calledCallbackName(sourceCode, node.callee);
        const enclosing = ancestorsOf(node).find(isFunctionNode);
        if (
          name !== undefined &&
          enclosing !== undefined &&
          isEffectCallback(sourceCode, enclosing) &&
          !runsOnlyOnMount(enclosing.parent)
        ) {
          context.report({ node, messageId: 'effectEvent', data: { name } });
        }
      },
    };
  },
};
