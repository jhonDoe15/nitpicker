import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  resolveFunction,
  stringValue,
} from '../analysis/constant-resolution.mts';
import { memberName, unwrapped, type Context } from '../security/security-values.mts';
import { ancestorsOf, depthFirst, nodeChildren } from '../typed/node-views.mts';
import { isExported } from '../typed/syntax-views.mts';
import {
  createBindings,
  isEmitterCreation,
  isServerCreation,
  type EmitterScope,
} from './emitter-creations.mts';
import { isConnectionEvent, isListenMethod } from './emitter-modules.mts';
import { referencesOutcome, type Inner } from './error-handling.mts';

type CallLike = TSESTree.CallExpression | TSESTree.NewExpression;
type Variable = TSESLint.Scope.Variable;
type Target = {
  readonly node: TSESTree.Node;
  readonly name: string;
  readonly references: readonly Inner[];
};

const { DefinitionType } = TSESLint.Scope;
const ASSIGNMENTS = new Set<string>(['=', '??=', '||=']);
const OWN_THIS = new Set<string>([
  AST_NODE_TYPES.MethodDefinition,
  AST_NODE_TYPES.PropertyDefinition,
]);

function keyName(key: TSESTree.Node, computed: boolean): string | undefined {
  if (key.type === AST_NODE_TYPES.PrivateIdentifier) {
    return `#${key.name}`;
  }
  return !computed && key.type === AST_NODE_TYPES.Identifier ? key.name : stringValue(key);
}

function thisField(member: TSESTree.Node | undefined): string | undefined {
  const isField =
    member?.type === AST_NODE_TYPES.MemberExpression &&
    member.object.type === AST_NODE_TYPES.ThisExpression;
  return isField ? keyName(member.property, member.computed) : undefined;
}

function hasOtherThis(node: TSESTree.Node, root: TSESTree.Node): boolean {
  if (node === root) {
    return false;
  }
  const isFunction =
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression;
  return node.type === AST_NODE_TYPES.ClassBody || (isFunction && !OWN_THIS.has(node.parent.type));
}

function isThisAlias(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.ThisExpression &&
    node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.init === node
  );
}

function fieldReferences(
  classBody: TSESTree.Node,
  key: string,
  written: TSESTree.Node | undefined,
): Inner[] {
  const nodes = depthFirst<TSESTree.Node>(classBody, (node) =>
    hasOtherThis(node, classBody) ? [] : nodeChildren(node),
  );
  return [...nodes].filter(
    (node): node is Inner =>
      node.type !== AST_NODE_TYPES.Program &&
      node !== written &&
      (thisField(node) === key || isThisAlias(node)),
  );
}

function variableReferences(variable: Variable, written?: TSESTree.Node): Inner[] {
  return variable.references
    .filter((reference) => !reference.init && reference.identifier !== written)
    .map((reference) => reference.identifier);
}

function isServerReceiver(scope: EmitterScope, receiver: TSESTree.Node): boolean {
  const target = unwrapped(receiver);
  if (target.type !== AST_NODE_TYPES.Identifier) {
    return isServerCreation(scope, target);
  }
  const definition = findVariable(scope.context, target, target.name)?.defs.at(0);
  return (
    definition?.type === DefinitionType.Variable &&
    isServerCreation(scope, definition.node.init ?? undefined)
  );
}

function listenerFunction(context: Context, node: TSESTree.Node | undefined) {
  return isFunctionNode(node) ? node : resolveFunction(context, node);
}

function connectionListener(scope: EmitterScope, call: CallLike) {
  const { context } = scope;
  const { callee } = call;
  if (isServerCreation(scope, call)) {
    return call.arguments.map((argument) => listenerFunction(context, argument)).findLast(Boolean);
  }
  const listens =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    isListenMethod(memberName(callee)) &&
    isConnectionEvent(stringValue(resolveConstant(context, call.arguments[0]))) &&
    isServerReceiver(scope, callee.object);
  return listens ? listenerFunction(context, call.arguments[1]) : undefined;
}

function check(scope: EmitterScope, { node, name, references }: Target): void {
  if (referencesOutcome(scope, references) === 'unhandled') {
    scope.context.report({ node, messageId: 'missingListener', data: { name } });
  }
}

function checkVariable(
  scope: EmitterScope,
  node: TSESTree.Node,
  identifier: TSESTree.Identifier,
): void {
  const variable = findVariable(scope.context, identifier, identifier.name);
  if (variable !== undefined) {
    const references = variableReferences(variable, identifier);
    check(scope, { node, name: identifier.name, references });
  }
}

function checkField(
  scope: EmitterScope,
  node: TSESTree.Node,
  { key, written }: { readonly key: string; readonly written: TSESTree.Node | undefined },
): void {
  const classBody = ancestorsOf(node).find(
    (ancestor) => ancestor.type === AST_NODE_TYPES.ClassBody,
  );
  if (classBody !== undefined) {
    const references = fieldReferences(classBody, key, written);
    check(scope, { node, name: `this.${key}`, references });
  }
}

function checkAssignment(scope: EmitterScope, node: TSESTree.AssignmentExpression): void {
  if (!(ASSIGNMENTS.has(node.operator) && isEmitterCreation(scope, node.right))) {
    return;
  }
  const key = thisField(node.left);
  if (key !== undefined) {
    checkField(scope, node.right, { key, written: node.left });
  } else if (node.left.type === AST_NODE_TYPES.Identifier) {
    checkVariable(scope, node.right, node.left);
  }
}

function checkConnection(scope: EmitterScope, node: CallLike): void {
  const listener = connectionListener(scope, node);
  const socket = listener?.params[0];
  if (listener === undefined || socket?.type !== AST_NODE_TYPES.Identifier) {
    return;
  }
  const variable = scope.context.sourceCode
    .getDeclaredVariables(listener)
    .find((entry) => entry.name === socket.name);
  if (variable !== undefined) {
    check(scope, { node: socket, name: socket.name, references: variableReferences(variable) });
  }
}

function visitors(scope: EmitterScope): TSESLint.RuleListener {
  return {
    VariableDeclarator(node: TSESTree.VariableDeclarator) {
      const { id, init } = node;
      const stored = id.type === AST_NODE_TYPES.Identifier && !isExported(node);
      if (stored && init !== null && isEmitterCreation(scope, init)) {
        checkVariable(scope, init, id);
      }
    },
    AssignmentExpression(node: TSESTree.AssignmentExpression) {
      checkAssignment(scope, node);
    },
    PropertyDefinition(node: TSESTree.PropertyDefinition) {
      const key = keyName(node.key, node.computed);
      const { value } = node;
      if (key !== undefined && !node.static && value !== null && isEmitterCreation(scope, value)) {
        checkField(scope, value, { key, written: undefined });
      }
    },
    'CallExpression, NewExpression'(node: CallLike) {
      checkConnection(scope, node);
    },
  };
}

export const rule: TSESLint.RuleModule<'missingListener'> = {
  meta: {
    type: 'problem',
    docs: {
      description: "Require an 'error' listener on streams, sockets, child processes and clients",
    },
    schema: [],
    messages: {
      missingListener:
        "`{{name}}` emits 'error' when its connection, file or process fails, and Node.js throws an 'error' event that has no listener, which stops the process. Attach one where it is created: `{{name}}.on('error', (error) => ...)`, or hand it to `pipeline(...)` or `finished(...)` from `node:stream/promises`, to `events.once(...)`, or read it with `for await`. An exception fits only when a crash of the process is the intended outcome.",
    },
  },
  create(context) {
    return visitors({ context, bindingsFor: createBindings(context.sourceCode.ast) });
  },
};
