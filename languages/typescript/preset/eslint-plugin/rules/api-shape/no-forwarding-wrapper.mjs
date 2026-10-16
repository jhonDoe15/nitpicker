import { variableNamed } from '../analysis/ancestry.mjs';
import { isComponentName } from '../../../syntax/component-names.mjs';

const EXPORT_DECLARATIONS = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration']);
const MODULE_SCOPES = new Set(['module', 'global']);

function isAbsent(value) {
  return value === undefined || value === null;
}

function forwardedCall(fn) {
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

function forwardsOwnParameters(fn, call) {
  const names = fn.params.map(parameterName);
  const forwarded = call.arguments.map(argumentName);
  const sameShape = fn.params.every(
    (parameter, index) =>
      (parameter.type === 'RestElement') === (call.arguments[index]?.type === 'SpreadElement'),
  );
  return (
    names.length > 0 &&
    names.length === forwarded.length &&
    sameShape &&
    names.every((name, index) => name !== undefined && name === forwarded[index])
  );
}

function isPlainFunction(fn) {
  return !fn.async && !fn.generator && isAbsent(fn.typeParameters);
}

function isModuleLevel(statement) {
  const owner = EXPORT_DECLARATIONS.has(statement.parent.type) ? statement.parent : statement;
  return owner.parent.type === 'Program';
}

function exportedNameOf(statement, name) {
  if (statement.parent.type === 'ExportNamedDeclaration') {
    return name;
  }
  if (statement.parent.type === 'ExportDefaultDeclaration') {
    return 'default';
  }
  return statement.parent.body.flatMap((node) => exportsOf(node, name)).at(0);
}

function exportsOf(node, name) {
  if (node.type === 'ExportDefaultDeclaration') {
    return node.declaration.type === 'Identifier' && node.declaration.name === name
      ? ['default']
      : [];
  }
  if (node.type !== 'ExportNamedDeclaration' || node.source !== null) {
    return [];
  }
  return node.specifiers
    .filter(({ local }) => local.type === 'Identifier' && local.name === name)
    .map(({ exported }) => (exported.type === 'Identifier' ? exported.name : exported.value));
}

function isImportableCallee(sourceCode, callee) {
  if (callee.type !== 'Identifier') {
    return false;
  }
  const variable = variableNamed(sourceCode, callee);
  return (
    variable !== undefined && variable.defs.length > 0 && MODULE_SCOPES.has(variable.scope.type)
  );
}

function hasOverloads(sourceCode, fn) {
  const variable = fn.id === null ? undefined : variableNamed(sourceCode, fn.id);
  return variable !== undefined && variable.defs.length > 1;
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

function hasSameSignature(services, wrapper, callee) {
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

export const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow a function that only forwards its parameters to another function',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      forwardingWrapper:
        '`{{ name }}` only forwards its parameters to `{{ target }}` and has the same parameter and return types. Delete it and export `{{ target }}` in its place with `export { {{ target }} as {{ exported }} }`, or call `{{ target }}` directly.',
      forwardingWrapperLocal:
        '`{{ name }}` only forwards its parameters to `{{ target }}` and has the same parameter and return types. Call `{{ target }}` directly where `{{ name }}` is used and delete the wrapper.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const services = sourceCode.parserServices;
    if (services?.program === null || services?.program === undefined) {
      return {};
    }

    function check({ fn, name, statement, reportNode }) {
      const call = forwardedCall(fn);
      if (
        isComponentName(name) ||
        !isPlainFunction(fn) ||
        !isModuleLevel(statement) ||
        call?.type !== 'CallExpression' ||
        call.optional ||
        !isAbsent(call.typeArguments ?? call.typeParameters) ||
        !isImportableCallee(sourceCode, call.callee) ||
        call.callee.name === name ||
        !forwardsOwnParameters(fn, call) ||
        hasOverloads(sourceCode, fn) ||
        !hasSameSignature(services, fn, call.callee)
      ) {
        return;
      }
      const exported = exportedNameOf(statement, name);
      context.report({
        node: reportNode,
        messageId: exported === undefined ? 'forwardingWrapperLocal' : 'forwardingWrapper',
        data: { name, target: call.callee.name, exported },
      });
    }

    return {
      FunctionDeclaration(node) {
        if (node.id !== null) {
          check({ fn: node, name: node.id.name, statement: node, reportNode: node });
        }
      },
      VariableDeclarator(node) {
        const init = node.init;
        const isFunction =
          init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression';
        if (isFunction && node.id.type === 'Identifier' && isAbsent(node.id.typeAnnotation)) {
          check({ fn: init, name: node.id.name, statement: node.parent, reportNode: node });
        }
      },
    };
  },
};
