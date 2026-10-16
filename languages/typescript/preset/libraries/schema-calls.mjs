import {
  destructuring,
  initializer,
  isUnresolved,
  libraryBinding,
  variableOf,
} from './module-bindings.mjs';

const SCHEMA_NAME = /schema|codec|validat|type|ajv|struct|parser/i;
const PASS_THROUGH = new Set([
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'AwaitExpression',
  'ChainExpression',
]);

export function schemaContext(context) {
  return { sourceCode: context.sourceCode, services: context.sourceCode.parserServices };
}

function methodNameOf(member) {
  if (member.computed) {
    return member.property.type === 'Literal' && typeof member.property.value === 'string'
      ? member.property.value
      : undefined;
  }
  return member.property.type === 'Identifier' ? member.property.name : undefined;
}

function hasLibraryType({ services }, node, packages) {
  if (services?.program === null || services?.program === undefined) {
    return false;
  }
  const type = services.program
    .getTypeChecker()
    .getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node));
  const symbol = type.aliasSymbol ?? type.getSymbol();
  return (symbol?.declarations ?? []).some((declaration) =>
    packages.some((name) =>
      declaration.getSourceFile().fileName.includes(`/node_modules/${name}/`),
    ),
  );
}

function derivedParents(sourceCode, node, packages) {
  switch (node.type) {
    case 'Identifier': {
      const variable = variableOf(sourceCode, node);
      return libraryBinding(variable, packages) === undefined ? [initializer(variable)] : true;
    }
    case 'MemberExpression':
      return [node.object];
    case 'CallExpression':
    case 'NewExpression':
      return [node.callee];
    case 'AwaitExpression':
      return [node.argument];
    default:
      return [];
  }
}

function isDerived({ sourceCode }, start, packages) {
  const pending = [start];
  const seen = new Set();
  for (const node of pending) {
    if (node !== null && node !== undefined && !seen.has(node)) {
      seen.add(node);
      const parents = derivedParents(sourceCode, node, packages);
      if (parents === true) {
        return true;
      }
      pending.push(...parents);
    }
  }
  return false;
}

function looksLikeSchema(ctx, receiver, packages) {
  return (
    SCHEMA_NAME.test(ctx.sourceCode.getText(receiver)) || hasLibraryType(ctx, receiver, packages)
  );
}

function isNamespaceReceiver({ sourceCode }, receiver, packages) {
  return (
    receiver.type === 'Identifier' &&
    libraryBinding(variableOf(sourceCode, receiver), packages) !== undefined
  );
}

function isMethodOn(ctx, receiver, method, library) {
  const { packages } = library;
  return (
    library.anyReceiver.includes(method) ||
    (library.derivedReceiver.includes(method) &&
      (isDerived(ctx, receiver, packages) || looksLikeSchema(ctx, receiver, packages))) ||
    (library.namespace.includes(method) && isNamespaceReceiver(ctx, receiver, packages))
  );
}

function isMemberParse(ctx, member, library) {
  const method = methodNameOf(member);
  return method !== undefined && isMethodOn(ctx, member.object, method, library);
}

function isFactoryCall(ctx, call, library) {
  const { callee } = call;
  if (callee.type === 'MemberExpression') {
    const method = methodNameOf(callee);
    return (
      library.factories.includes(method) &&
      isNamespaceReceiver(ctx, callee.object, library.packages)
    );
  }
  const binding =
    callee.type === 'Identifier'
      ? libraryBinding(variableOf(ctx.sourceCode, callee), library.packages)
      : undefined;
  return binding !== undefined && library.factories.includes(binding.name);
}

function isBoundParse(ctx, call, library) {
  const { callee } = call;
  return (
    callee.type === 'MemberExpression' &&
    methodNameOf(callee) === 'bind' &&
    callee.object.type === 'MemberExpression' &&
    isMemberParse(ctx, callee.object, library)
  );
}

function isCallableSchema(ctx, callee, library) {
  const variable = variableOf(ctx.sourceCode, callee);
  return (
    library.callable &&
    (isDerived(ctx, initializer(variable), library.packages) ||
      (isUnresolved(variable) &&
        (SCHEMA_NAME.test(callee.name) || hasLibraryType(ctx, callee, library.packages))))
  );
}

function isIdentifierParse(ctx, callee, library) {
  const variable = variableOf(ctx.sourceCode, callee);
  const binding = libraryBinding(variable, library.packages);
  if (binding !== undefined) {
    return library.imported.includes(binding.name);
  }
  const init = initializer(variable);
  const method = destructuring(variable);
  return (
    (init?.type === 'CallExpression' &&
      (isFactoryCall(ctx, init, library) || isBoundParse(ctx, init, library))) ||
    (method !== undefined && isMethodOn(ctx, method.receiver, method.method, library)) ||
    isCallableSchema(ctx, callee, library)
  );
}

function isParseCall(ctx, call, libraries) {
  const { callee } = call;
  return libraries.some((library) => {
    switch (callee.type) {
      case 'MemberExpression':
        return isMemberParse(ctx, callee, library);
      case 'Identifier':
        return isIdentifierParse(ctx, callee, library);
      case 'CallExpression':
        return isFactoryCall(ctx, callee, library);
      default:
        return false;
    }
  });
}

function isTransformCall({ sourceCode }, call, libraries) {
  if (call.callee.type !== 'Identifier') {
    return false;
  }
  const variable = variableOf(sourceCode, call.callee);
  return libraries.some((library) => {
    const binding = libraryBinding(variable, library.packages);
    return binding !== undefined && library.transform.includes(binding.name);
  });
}

function isPipeInto(ctx, call, expression, libraries) {
  return (
    call.callee.type === 'Identifier' &&
    call.callee.name === 'pipe' &&
    call.arguments[0] === expression &&
    call.arguments
      .slice(1)
      .some(
        (argument) =>
          argument.type === 'MemberExpression' &&
          libraries.some((library) => isMemberParse(ctx, argument, library)),
      )
  );
}

function isFlowParent(identifier) {
  const parent = identifier.parent;
  return (
    PASS_THROUGH.has(parent.type) ||
    (parent.type === 'CallExpression' && parent.arguments.includes(identifier)) ||
    (parent.type === 'VariableDeclarator' && parent.init === identifier)
  );
}

function flowTargets(ctx, expression, libraries) {
  const parent = expression.parent;
  if (PASS_THROUGH.has(parent.type)) {
    return [parent];
  }
  if (parent.type === 'CallExpression' && parent.arguments.includes(expression)) {
    if (isParseCall(ctx, parent, libraries) || isPipeInto(ctx, parent, expression, libraries)) {
      return true;
    }
    return isTransformCall(ctx, parent, libraries) ? [parent] : [];
  }
  if (
    parent.type === 'VariableDeclarator' &&
    parent.init === expression &&
    parent.id.type === 'Identifier'
  ) {
    return ctx.sourceCode
      .getDeclaredVariables(parent)
      .flatMap((variable) => variable.references)
      .map((reference) => reference.identifier)
      .filter((identifier) => identifier !== parent.id && isFlowParent(identifier));
  }
  return [];
}

export function isParsedBySchema(ctx, expression, libraries) {
  const pending = [expression];
  const seen = new Set();
  for (const node of pending) {
    if (!seen.has(node)) {
      seen.add(node);
      const targets = flowTargets(ctx, node, libraries);
      if (targets === true) {
        return true;
      }
      pending.push(...targets);
    }
  }
  return false;
}
