import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  chainOf,
  contains,
  nameOf,
  variableNamed,
  type SourceCode,
} from '../../typed/node-views.mts';
import { isFunction, unwrapped, type FunctionNode } from '../../typed/syntax-views.mts';
import { hookName, nodesOutsideNestedFunctions } from '../react-effects.mts';
import { functionLabel, isComponentName } from '../support/component-names.mts';
import { setterPair } from '../support/state-pairs.mts';
import { parameterMutators, stateMutators } from './state-collections.mts';

type MessageId = 'nestedUpdate' | 'propCallback' | 'mutation';
type Pure = {
  readonly fn: FunctionNode;
  readonly where: string;
  readonly mutators: ReadonlySet<string>;
};
type Report = {
  readonly node: TSESTree.Node;
  readonly messageId: MessageId;
  readonly name: string;
};

const { DefinitionType } = TSESLint.Scope;

function isComponent(fn: TSESTree.Node): boolean {
  return isComponentName(functionLabel(fn));
}

function componentParameter(
  sourceCode: SourceCode,
  node: TSESTree.Node,
): { readonly name: TSESTree.Node; readonly props: TSESTree.Parameter | undefined } | undefined {
  const definition =
    node.type === AST_NODE_TYPES.Identifier
      ? variableNamed(sourceCode, node)?.defs.at(0)
      : undefined;
  return definition?.type === DefinitionType.Parameter && isComponent(definition.node)
    ? { name: definition.name, props: definition.node.params[0] }
    : undefined;
}

function isPropCallback(sourceCode: SourceCode, callee: TSESTree.Node): boolean {
  const target = unwrapped(callee);
  if (target.type === AST_NODE_TYPES.MemberExpression) {
    const owner = componentParameter(sourceCode, target.object);
    return !target.computed && owner !== undefined && owner.props === owner.name;
  }
  const owner = componentParameter(sourceCode, target);
  return owner?.props?.type === AST_NODE_TYPES.ObjectPattern && contains(owner.props, owner.name);
}

function effectOf(sourceCode: SourceCode, node: TSESTree.Node): Report | undefined {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const name = sourceCode.getText(node.callee);
  if (setterPair(sourceCode, node.callee) !== undefined) {
    return { node, messageId: 'nestedUpdate', name };
  }
  const holder =
    node.parent.type === AST_NODE_TYPES.ChainExpression ? node.parent.parent : node.parent;
  return holder.type === AST_NODE_TYPES.ExpressionStatement &&
    isPropCallback(sourceCode, node.callee)
    ? { node, messageId: 'propCallback', name }
    : undefined;
}

function memberRoot(identifier: TSESTree.Node): TSESTree.Node {
  const chain = chainOf(identifier, (current) =>
    current.parent?.type === AST_NODE_TYPES.MemberExpression && current.parent.object === current
      ? current.parent
      : undefined,
  );
  return chain.at(-1) ?? identifier;
}

function changesInPlace(
  identifier: TSESTree.Node,
  mutators: ReadonlySet<string>,
): TSESTree.Node | undefined {
  const direct = identifier.parent;
  const top = memberRoot(identifier);
  const holder = top.parent;
  if (top === identifier || holder === undefined) {
    return undefined;
  }
  const assigned =
    (holder.type === AST_NODE_TYPES.AssignmentExpression && holder.left === top) ||
    holder.type === AST_NODE_TYPES.UpdateExpression ||
    (holder.type === AST_NODE_TYPES.UnaryExpression && holder.operator === 'delete');
  const called =
    holder.type === AST_NODE_TYPES.CallExpression &&
    holder.callee === top &&
    top === direct &&
    direct.type === AST_NODE_TYPES.MemberExpression &&
    !direct.computed &&
    mutators.has(nameOf(direct.property) ?? '');
  return assigned || called ? holder : undefined;
}

function mutationsOf(sourceCode: SourceCode, { fn, mutators }: Pure): Report[] {
  const [parameter] = fn.params;
  if (parameter?.type !== AST_NODE_TYPES.Identifier) {
    return [];
  }
  const variable = sourceCode.getDeclaredVariables(fn).find((each) => each.name === parameter.name);
  const references = variable?.references ?? [];
  if (references.some((reference) => reference.isWrite())) {
    return [];
  }
  return references.flatMap((reference): Report[] => {
    const node = changesInPlace(reference.identifier, mutators);
    return node === undefined ? [] : [{ node, messageId: 'mutation', name: parameter.name }];
  });
}

function declaredFunction(
  sourceCode: SourceCode,
  argument: TSESTree.Node,
): TSESTree.Node | undefined {
  if (argument.type !== AST_NODE_TYPES.Identifier) {
    return argument;
  }
  const definition = variableNamed(sourceCode, argument)?.defs.at(0);
  return definition?.type === DefinitionType.Variable
    ? (definition.node.init ?? undefined)
    : definition?.node;
}

function reducerOf(sourceCode: SourceCode, argument: TSESTree.Node | undefined): Pure | undefined {
  const fn = argument === undefined ? undefined : declaredFunction(sourceCode, argument);
  if (fn === undefined || !isFunction(fn)) {
    return undefined;
  }
  const [state] = fn.params;
  return {
    fn,
    where: 'a reducer',
    mutators:
      state?.type === AST_NODE_TYPES.Identifier ? parameterMutators(sourceCode, state) : new Set(),
  };
}

function pureFunctionOf(sourceCode: SourceCode, node: TSESTree.CallExpression): Pure | undefined {
  const [first] = node.arguments;
  if (hookName(sourceCode, node.callee) === 'useReducer') {
    return reducerOf(sourceCode, first);
  }
  const pair = setterPair(sourceCode, node.callee);
  return pair?.hook === 'useState' && first !== undefined && isFunction(first)
    ? { fn: first, where: 'a state updater', mutators: stateMutators(sourceCode, pair.call) }
    : undefined;
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: { description: 'Require state updater functions and reducers to be pure' },
    schema: [],
    messages: {
      nestedUpdate:
        '`{{name}}` is called inside {{where}}, which React may run more than once (twice under ' +
        'StrictMode), so the inner update repeats. Compute the next value first, then call each ' +
        'setter in the handler, one after the other.',
      propCallback:
        '`{{name}}` is a prop callback called inside {{where}}, which React may run more than ' +
        'once (twice under StrictMode) and while it renders. Compute the next value first, then ' +
        'call the setter and `{{name}}` in the handler.',
      mutation:
        'This changes `{{name}}`, the previous state, in place inside {{where}}, so React sees ' +
        'the same reference or applies the change twice. Return a new value: ' +
        '`[...{{name}}, item]`, `{ ...{{name}}, key: value }`, `new Set({{name}}).add(item)`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const reported = new Set<TSESTree.Node>();
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const pure = pureFunctionOf(sourceCode, node);
        if (pure === undefined) {
          return;
        }
        const effects = nodesOutsideNestedFunctions(pure.fn.body).flatMap(
          (inner) => effectOf(sourceCode, inner) ?? [],
        );
        for (const { node: target, messageId, name } of [
          ...effects,
          ...mutationsOf(sourceCode, pure),
        ]) {
          if (!reported.has(target)) {
            reported.add(target);
            context.report({ node: target, messageId, data: { name, where: pure.where } });
          }
        }
      },
    };
  },
};
