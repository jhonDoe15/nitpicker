export function isAbsent(value) {
  return value === undefined || value === null;
}

export function forwardedCall(fn) {
  if (fn.body.type !== 'BlockStatement') {
    return fn.body;
  }
  const [only, ...rest] = fn.body.body;
  return rest.length === 0 && only?.type === 'ReturnStatement' ? only.argument : undefined;
}

function parameterName(parameter) {
  if (parameter.type === 'Identifier') {
    return parameter.name;
  }
  return parameter.type === 'RestElement' && parameter.argument.type === 'Identifier'
    ? parameter.argument.name
    : undefined;
}

function argumentName(argument) {
  if (argument.type === 'Identifier') {
    return argument.name;
  }
  return argument.type === 'SpreadElement' && argument.argument.type === 'Identifier'
    ? argument.argument.name
    : undefined;
}

export function forwardsOwnParameters(fn, call) {
  const names = fn.params.map(parameterName);
  const forwarded = call.arguments.map(argumentName);
  const sameShape = fn.params.every(
    (parameter, index) =>
      (parameter.type === 'RestElement') === (call.arguments[index]?.type === 'SpreadElement'),
  );
  return (
    names.length === forwarded.length &&
    sameShape &&
    names.every((name, index) => name !== undefined && name === forwarded[index])
  );
}

export function isPlainFunction(fn) {
  return !fn.async && !fn.generator && isAbsent(fn.typeParameters);
}

function parameterShape(checker, parameter) {
  const declaration = parameter.valueDeclaration;
  return {
    type: checker.getTypeOfSymbol(parameter),
    optional: declaration !== undefined && checker.isOptionalParameter(declaration),
    rest: declaration?.dotDotDotToken !== undefined,
  };
}

function sameParameters(checker, own, target) {
  return (
    own.parameters.length === target.parameters.length &&
    own.parameters.every((parameter, index) => {
      const mine = parameterShape(checker, parameter);
      const theirs = parameterShape(checker, target.parameters[index]);
      return (
        mine.type === theirs.type && mine.optional === theirs.optional && mine.rest === theirs.rest
      );
    })
  );
}

export function hasSameSignature(services, wrapper, callee) {
  const checker = services.program.getTypeChecker();
  const wrapperSignatures = services.getTypeAtLocation(wrapper).getCallSignatures();
  const calleeSignatures = services.getTypeAtLocation(callee).getCallSignatures();
  if (wrapperSignatures.length !== 1 || calleeSignatures.length !== 1) {
    return false;
  }
  const [own] = wrapperSignatures;
  const [target] = calleeSignatures;
  const predicates = [own, target].filter(
    (signature) => checker.getTypePredicateOfSignature(signature) !== undefined,
  );
  return (
    predicates.length === 0 &&
    sameParameters(checker, own, target) &&
    own.getReturnType() === target.getReturnType()
  );
}
