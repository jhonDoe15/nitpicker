import { ts } from '../../../../typescript-api/typescript-api.mjs';

const PUBLISHED_NAMES = new Set(['of', 'from']);

function keyName(member) {
  const { key } = member;
  if (key.type === 'PrivateIdentifier') {
    return `#${key.name}`;
  }
  if (key.type === 'Literal') {
    return String(key.value);
  }
  return key.type === 'Identifier' ? key.name : undefined;
}

function soleStatement(fn) {
  const [only, ...rest] = fn.body.body;
  return rest.length === 0 ? only : undefined;
}

function forwardedCall(fn) {
  const statement = soleStatement(fn);
  let value;
  if (statement?.type === 'ReturnStatement') {
    value = statement.argument;
  } else if (statement?.type === 'ExpressionStatement') {
    value = statement.expression;
  }
  const awaited = value?.type === 'AwaitExpression';
  if (fn.async && statement?.type === 'ExpressionStatement' && !awaited) {
    return undefined;
  }
  const call = fn.async && awaited ? value.argument : value;
  return call?.type === 'CallExpression' ? call : undefined;
}

function isPassedUnchanged(param, argument) {
  const spread = argument.type === 'SpreadElement';
  const rest = param.type === 'RestElement';
  const own = rest ? param.argument : param;
  const passed = spread ? argument.argument : argument;
  return (
    rest === spread &&
    own.type === 'Identifier' &&
    own.name !== 'this' &&
    passed.type === 'Identifier' &&
    passed.name === own.name
  );
}

function forwardsOwnParameters(fn, call) {
  return (
    fn.params.length > 0 &&
    fn.params.length === call.arguments.length &&
    fn.params.every((param, index) => isPassedUnchanged(param, call.arguments[index]))
  );
}

function isThisMethodCall(call) {
  const { callee } = call;
  return (
    !call.optional &&
    !(call.typeArguments ?? call.typeParameters) &&
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    !callee.optional &&
    callee.object.type === 'ThisExpression' &&
    ['Identifier', 'PrivateIdentifier'].includes(callee.property.type)
  );
}

function isCandidate(member) {
  const fn = member.value;
  return (
    member.kind === 'method' &&
    !member.computed &&
    !member.override &&
    (member.decorators ?? []).length === 0 &&
    !fn.params.some((param) => (param.decorators ?? []).length > 0) &&
    keyName(member) !== undefined &&
    !PUBLISHED_NAMES.has(keyName(member)) &&
    fn.body !== null &&
    !fn.generator &&
    !fn.typeParameters
  );
}

function sameType(checker, own, target) {
  const left = checker.getTypeAtLocation(own);
  const right = checker.getTypeAtLocation(target);
  return (
    left === right ||
    (left.getCallSignatures().length > 0 &&
      checker.isTypeAssignableTo(left, right) &&
      checker.isTypeAssignableTo(right, left))
  );
}

function sameParameter(checker, own, target) {
  return (
    sameType(checker, own, target) &&
    Boolean(own.questionToken) === Boolean(target.questionToken) &&
    Boolean(own.dotDotDotToken) === Boolean(target.dotDotDotToken)
  );
}

function returnTypeOf(checker, declaration) {
  return checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(declaration));
}

function hasSameSignature(checker, own, target) {
  return (
    !ts.isTypePredicateNode(own.type ?? target) &&
    !ts.isTypePredicateNode(target.type ?? own) &&
    own.typeParameters === undefined &&
    target.typeParameters === undefined &&
    own.parameters.length === target.parameters.length &&
    own.parameters.every((parameter, index) =>
      sameParameter(checker, parameter, target.parameters[index]),
    ) &&
    returnTypeOf(checker, own) === returnTypeOf(checker, target)
  );
}

function isAsync(declaration) {
  return (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Async) !== 0;
}

function isVoidResult(checker, declaration) {
  const text = checker.typeToString(returnTypeOf(checker, declaration));
  return text === 'void' || text === 'Promise<void>';
}

function targetDeclaration(services, call, tsClass) {
  const symbol = services.getSymbolAtLocation(call.callee.property);
  const declarations = symbol?.declarations ?? [];
  const [declaration] = declarations;
  return declarations.length === 1 &&
    ts.isMethodDeclaration(declaration) &&
    declaration.parent === tsClass &&
    (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Abstract) === 0
    ? declaration
    : undefined;
}

function isMerged(checker, tsClass, name) {
  const property = checker.getTypeAtLocation(tsClass).getProperty(name);
  return (property?.declarations ?? []).some((declaration) => declaration.parent !== tsClass);
}

function inheritsMember(checker, tsClass, name) {
  const heritage = tsClass.heritageClauses ?? [];
  if (heritage.length === 0) {
    return isMerged(checker, tsClass, name);
  }
  const extended = checker.getBaseTypes(checker.getTypeAtLocation(tsClass));
  const implemented = (ts.getEffectiveImplementsTypeNodes(tsClass) ?? []).map((node) =>
    checker.getTypeFromTypeNode(node),
  );
  const unresolved =
    (ts.getEffectiveBaseTypeNode(tsClass) !== undefined && extended.length === 0) ||
    implemented.some((type) => (type.flags & ts.TypeFlags.Any) !== 0);
  return (
    unresolved ||
    isMerged(checker, tsClass, name) ||
    [...extended, ...implemented].some((type) => type.getProperty(name))
  );
}

function visibilityOf(declaration) {
  const flags = ts.getCombinedModifierFlags(declaration);
  if (ts.isPrivateIdentifier(declaration.name) || (flags & ts.ModifierFlags.Private) !== 0) {
    return 2;
  }
  return (flags & ts.ModifierFlags.Protected) === 0 ? 0 : 1;
}

function aliasCall(member) {
  const call = isCandidate(member) ? forwardedCall(member.value) : undefined;
  return call !== undefined && isThisMethodCall(call) && forwardsOwnParameters(member.value, call)
    ? call
    : undefined;
}

function calleeName(call) {
  const { property } = call.callee;
  return property.type === 'PrivateIdentifier' ? `#${property.name}` : property.name;
}

function isLaterOfMutual(classNode, member, call) {
  const back = classNode.body.body.find(
    (other) => other.type === 'MethodDefinition' && keyName(other) === calleeName(call),
  );
  const backCall = back === undefined ? undefined : aliasCall(back);
  return (
    backCall === undefined ||
    calleeName(backCall) !== keyName(member) ||
    back.range[0] < member.range[0]
  );
}

function aliasVerdict({ services, checker }, { member, classNode, call }) {
  const name = keyName(member);
  const tsClass = services.esTreeNodeToTSNodeMap.get(classNode);
  const own = services.esTreeNodeToTSNodeMap.get(member);
  const target = targetDeclaration(services, call, tsClass);
  const overloaded = classNode.body.body.filter(
    (other) => other.type === 'MethodDefinition' && keyName(other) === name,
  );
  const isAlias =
    target !== undefined &&
    target !== own &&
    overloaded.length === 1 &&
    !(member.value.async && !isAsync(target)) &&
    (member.value.body.body[0].type === 'ReturnStatement' || isVoidResult(checker, own)) &&
    hasSameSignature(checker, own, target) &&
    ts.getJSDocDeprecatedTag(own) === undefined &&
    isLaterOfMutual(classNode, member, call) &&
    !inheritsMember(checker, tsClass, name);
  return isAlias ? { rename: visibilityOf(own) < visibilityOf(target) } : undefined;
}

export const rule = {
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
    if (services?.program === null || services?.program === undefined) {
      return {};
    }
    const program = { services, checker: services.program.getTypeChecker() };

    return {
      MethodDefinition(member) {
        const classNode = member.parent.parent;
        const call = classNode.type === 'ClassDeclaration' ? aliasCall(member) : undefined;
        const verdict =
          call === undefined ? undefined : aliasVerdict(program, { member, classNode, call });
        if (verdict !== undefined) {
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
