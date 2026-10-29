import ts from 'typescript';

const PUBLISHED_NAMES = new Set(['of', 'from']);

function keyName(member) {
  const { key } = member;
  if (key.type === 'PrivateIdentifier') {
    return `#${key.name}`;
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
  const call = fn.async && value?.type === 'AwaitExpression' ? value.argument : value;
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
    !PUBLISHED_NAMES.has(keyName(member)) &&
    fn.body !== null &&
    !fn.generator &&
    !fn.typeParameters
  );
}

function sameParameter(checker, own, target) {
  return (
    checker.getTypeAtLocation(own) === checker.getTypeAtLocation(target) &&
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
    declaration.parent === tsClass
    ? declaration
    : undefined;
}

function inheritsMember(checker, tsClass, name) {
  const heritage = tsClass.heritageClauses ?? [];
  if (heritage.length === 0) {
    return false;
  }
  const extended = checker.getBaseTypes(checker.getTypeAtLocation(tsClass));
  const implemented = (ts.getEffectiveImplementsTypeNodes(tsClass) ?? []).map((node) =>
    checker.getTypeFromTypeNode(node),
  );
  const unresolved =
    (ts.getEffectiveBaseTypeNode(tsClass) !== undefined && extended.length === 0) ||
    implemented.some((type) => (type.flags & ts.TypeFlags.Any) !== 0);
  return unresolved || [...extended, ...implemented].some((type) => type.getProperty(name));
}

function isAlias({ services, checker }, { member, classNode, call }) {
  const name = keyName(member);
  const tsClass = services.esTreeNodeToTSNodeMap.get(classNode);
  const own = services.esTreeNodeToTSNodeMap.get(member);
  const target = targetDeclaration(services, call, tsClass);
  const overloaded = classNode.body.body.filter(
    (other) => other.type === 'MethodDefinition' && keyName(other) === name,
  );
  return (
    target !== undefined &&
    target !== own &&
    overloaded.length === 1 &&
    !(member.value.async && !isAsync(target)) &&
    (member.value.body.body[0].type === 'ReturnStatement' || isVoidResult(checker, own)) &&
    hasSameSignature(checker, own, target) &&
    ts.getJSDocDeprecatedTag(own) === undefined &&
    !inheritsMember(checker, tsClass, name)
  );
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
        const call = isCandidate(member) ? forwardedCall(member.value) : undefined;
        if (
          classNode.type !== 'ClassDeclaration' ||
          call === undefined ||
          !isThisMethodCall(call) ||
          !forwardsOwnParameters(member.value, call) ||
          !isAlias(program, { member, classNode, call })
        ) {
          return;
        }
        const { property } = call.callee;
        context.report({
          node: member.key,
          messageId: 'forwardingMethodAlias',
          data: {
            name: keyName(member),
            target: property.type === 'PrivateIdentifier' ? `#${property.name}` : property.name,
          },
        });
      },
    };
  },
};
