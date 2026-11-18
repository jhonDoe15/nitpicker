import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { hasTypeInformation } from '../promises/cannot-reject.mts';
import { depthFirst, isNode, objectChildren } from '../typed/node-views.mts';
import { ts } from '../typed/typescript-views.mts';
import {
  hasSameSignature,
  inheritsMember,
  isAsync,
  isVoidResult,
  targetDeclaration,
  visibilityOf,
} from './forwarding-signatures.mts';

type Method = TSESTree.MethodDefinition & { readonly value: TSESTree.FunctionExpression };
type ThisMethodCall = TSESTree.CallExpression & {
  readonly callee: TSESTree.MemberExpressionNonComputedName;
};
type MessageId = 'forwardingMethodAlias' | 'forwardingMethodRename';
type Docs = { readonly requiresTypeChecking: boolean };
type Match = {
  readonly member: Method;
  readonly classNode: TSESTree.ClassDeclaration;
  readonly call: ThisMethodCall;
};
type WrittenNames = WeakMap<TSESTree.ClassDeclaration, Set<string | undefined>>;
type Program = {
  readonly services: ParserServicesWithTypeInformation;
  readonly checker: TypeScript.TypeChecker;
  readonly writtenNames: WrittenNames;
};

const PUBLISHED_NAMES = new Set<string | undefined>(['of', 'from']);

function keyName(member: TSESTree.MethodDefinition): string | undefined {
  const { key } = member;
  if (key.type === AST_NODE_TYPES.PrivateIdentifier) {
    return `#${key.name}`;
  }
  if (key.type === AST_NODE_TYPES.Literal) {
    return String(key.value);
  }
  return key.type === AST_NODE_TYPES.Identifier ? key.name : undefined;
}

function soleStatement(fn: TSESTree.FunctionExpression): TSESTree.Statement | undefined {
  const [only, ...rest] = fn.body.body;
  return rest.length === 0 ? only : undefined;
}

function forwardedCall(fn: TSESTree.FunctionExpression): TSESTree.CallExpression | undefined {
  const statement = soleStatement(fn);
  let value: TSESTree.Node | undefined;
  if (statement?.type === AST_NODE_TYPES.ReturnStatement) {
    value = statement.argument ?? undefined;
  } else if (statement?.type === AST_NODE_TYPES.ExpressionStatement) {
    value = statement.expression;
  }
  const awaited = value?.type === AST_NODE_TYPES.AwaitExpression ? value.argument : undefined;
  if (fn.async && statement?.type === AST_NODE_TYPES.ExpressionStatement && awaited === undefined) {
    return undefined;
  }
  const call = fn.async && awaited !== undefined ? awaited : value;
  return call?.type === AST_NODE_TYPES.CallExpression ? call : undefined;
}

function isPassedUnchanged(
  param: TSESTree.Parameter,
  argument: TSESTree.CallExpressionArgument,
): boolean {
  const own = param.type === AST_NODE_TYPES.RestElement ? param.argument : param;
  const passed = argument.type === AST_NODE_TYPES.SpreadElement ? argument.argument : argument;
  return (
    (param.type === AST_NODE_TYPES.RestElement) ===
      (argument.type === AST_NODE_TYPES.SpreadElement) &&
    own.type === AST_NODE_TYPES.Identifier &&
    own.name !== 'this' &&
    passed.type === AST_NODE_TYPES.Identifier &&
    passed.name === own.name
  );
}

function forwardsOwnParameters(
  fn: TSESTree.FunctionExpression,
  call: TSESTree.CallExpression,
): boolean {
  return (
    fn.params.length > 0 &&
    fn.params.length === call.arguments.length &&
    fn.params.every((param, index) => {
      const argument = call.arguments[index];
      return argument !== undefined && isPassedUnchanged(param, argument);
    })
  );
}

function isThisMethodCall(call: TSESTree.CallExpression): call is ThisMethodCall {
  const { callee } = call;
  return (
    !call.optional &&
    !call.typeArguments &&
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    !callee.optional &&
    callee.object.type === AST_NODE_TYPES.ThisExpression
  );
}

function isCandidate(member: TSESTree.MethodDefinition): member is Method {
  const fn = member.value;
  return (
    member.kind === 'method' &&
    !member.computed &&
    !member.override &&
    member.decorators.length === 0 &&
    !fn.params.some((param) => param.decorators.length > 0) &&
    keyName(member) !== undefined &&
    !PUBLISHED_NAMES.has(keyName(member)) &&
    fn.type === AST_NODE_TYPES.FunctionExpression &&
    !fn.generator &&
    !fn.typeParameters
  );
}

function aliasCall(member: Method): ThisMethodCall | undefined {
  const call = forwardedCall(member.value);
  return call !== undefined && isThisMethodCall(call) && forwardsOwnParameters(member.value, call)
    ? call
    : undefined;
}

function propertyName(property: TSESTree.Identifier | TSESTree.PrivateIdentifier): string {
  return property.type === AST_NODE_TYPES.PrivateIdentifier ? `#${property.name}` : property.name;
}

function calleeName(call: ThisMethodCall): string {
  return propertyName(call.callee.property);
}

function isMethod(element: TSESTree.ClassElement): element is TSESTree.MethodDefinition {
  return element.type === AST_NODE_TYPES.MethodDefinition;
}

function isLaterOfMutual(
  classNode: TSESTree.ClassDeclaration,
  member: Method,
  call: ThisMethodCall,
): boolean {
  const back = classNode.body.body
    .filter(isMethod)
    .find((other) => keyName(other) === calleeName(call));
  const backCall = back !== undefined && isCandidate(back) ? aliasCall(back) : undefined;
  return (
    back === undefined ||
    backCall === undefined ||
    calleeName(backCall) !== keyName(member) ||
    back.range[0] < member.range[0]
  );
}

function namesWrittenOnThis(
  writtenNames: WrittenNames,
  classNode: TSESTree.ClassDeclaration,
): Set<string | undefined> {
  const cached = writtenNames.get(classNode);
  if (cached !== undefined) {
    return cached;
  }
  const names = new Set<string | undefined>();
  for (const node of depthFirst<object>(classNode.body, objectChildren)) {
    const left =
      isNode(node) && node.type === AST_NODE_TYPES.AssignmentExpression ? node.left : undefined;
    if (
      left?.type === AST_NODE_TYPES.MemberExpression &&
      left.object.type === AST_NODE_TYPES.ThisExpression
    ) {
      names.add(left.computed ? '[]' : propertyName(left.property));
    }
  }
  writtenNames.set(classNode, names);
  return names;
}

function isReassigned(
  writtenNames: WrittenNames,
  classNode: TSESTree.ClassDeclaration,
  names: readonly (string | undefined)[],
): boolean {
  const written = namesWrittenOnThis(writtenNames, classNode);
  return written.has('[]') || names.some((name) => written.has(name));
}

function aliasVerdict(
  { services, checker, writtenNames }: Program,
  { member, classNode, call }: Match,
): { readonly rename: boolean } | undefined {
  const name = keyName(member);
  const tsClass = services.esTreeNodeToTSNodeMap.get(classNode);
  const own = services.esTreeNodeToTSNodeMap.get(member);
  if (!ts.isMethodDeclaration(own)) {
    return undefined;
  }
  const target = targetDeclaration(services, call.callee.property, tsClass);
  const overloaded = classNode.body.body
    .filter(isMethod)
    .filter((other) => keyName(other) === name);
  const isAlias =
    target !== undefined &&
    target !== own &&
    overloaded.length === 1 &&
    !(member.value.async && !isAsync(target)) &&
    (member.value.body.body[0]?.type === AST_NODE_TYPES.ReturnStatement ||
      isVoidResult(checker, own)) &&
    hasSameSignature(checker, own, target) &&
    ts.getJSDocDeprecatedTag(own) === undefined &&
    isLaterOfMutual(classNode, member, call) &&
    !isReassigned(writtenNames, classNode, [name, calleeName(call)]) &&
    name !== undefined &&
    !inheritsMember(checker, tsClass, name);
  return isAlias ? { rename: visibilityOf(own) < visibilityOf(target) } : undefined;
}

export const rule: TSESLint.RuleModule<MessageId, [], Docs> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow a method that only forwards its parameters to another method of its class',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      forwardingMethodAlias:
        '`{{ name }}` only forwards its parameters to `{{ target }}` and has the same parameter and return types. Call `{{ target }}` directly and delete `{{ name }}`.',
      forwardingMethodRename:
        '`{{ name }}` only forwards its parameters to `{{ target }}` and has the same parameter and return types. Rename `{{ target }}` to `{{ name }}` and delete the alias.',
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (!hasTypeInformation(services)) {
      return {};
    }
    const program = {
      services,
      checker: services.program.getTypeChecker(),
      writtenNames: new WeakMap(),
    };

    return {
      MethodDefinition(member) {
        const classNode = member.parent.parent;
        if (classNode.type !== AST_NODE_TYPES.ClassDeclaration || !isCandidate(member)) {
          return;
        }
        const call = aliasCall(member);
        const verdict =
          call === undefined ? undefined : aliasVerdict(program, { member, classNode, call });
        if (call !== undefined && verdict !== undefined) {
          context.report({
            node: member.key,
            messageId: verdict.rename ? 'forwardingMethodRename' : 'forwardingMethodAlias',
            data: { name: keyName(member), target: calleeName(call) },
          });
        }
      },
    };
  },
};
