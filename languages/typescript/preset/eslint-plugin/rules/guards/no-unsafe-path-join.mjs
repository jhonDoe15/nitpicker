import { ancestorsOf, variableNamed } from '../analysis/ancestry.mjs';
import { importedCalleeName, moduleBindings } from '../analysis/subprocess-calls.mjs';

const FS_MODULES = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises']);
const PATH_MODULES = new Set(['path', 'node:path', 'path/posix', 'node:path/posix']);
const TWO_PATH_FUNCTIONS = new Set(['rename', 'copyFile'].flatMap((name) => [name, `${name}Sync`]));
const FS_FUNCTIONS = new Set(
  [
    'readFile',
    'writeFile',
    'appendFile',
    'readdir',
    'unlink',
    'rm',
    'stat',
    'access',
    'mkdir',
    'open',
    'readlink',
    'truncate',
    'createReadStream',
  ]
    .flatMap((name) => [name, `${name}Sync`])
    .concat(['createWriteStream', ...TWO_PATH_FUNCTIONS]),
);
const RESPONSE_SINKS = new Set(['sendFile']);
const WRAPPED_EXPRESSIONS = new Set([
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'ChainExpression',
]);
const PATH_BUILDERS = new Set(['join', 'resolve']);
const MAX_TAINT_STEPS = 50;
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

function constantInitializer(sourceCode, identifier) {
  const definition = variableNamed(sourceCode, identifier)?.defs.at(0);
  return definition?.type === 'Variable' && definition.parent.kind === 'const'
    ? (definition.node.init ?? undefined)
    : undefined;
}

function isParameter(sourceCode, identifier) {
  return (
    variableNamed(sourceCode, identifier)?.defs.some(({ type }) => type === 'Parameter') === true
  );
}

function callTaintSources(call, pathModule) {
  return importedCalleeName(call.callee, pathModule) === 'basename'
    ? []
    : [call.callee, ...call.arguments];
}

function taintSources(scope, expression) {
  if (WRAPPED_EXPRESSIONS.has(expression.type)) {
    return [expression.expression];
  }
  switch (expression.type) {
    case 'Identifier': {
      const initializer = constantInitializer(scope.sourceCode, expression);
      return initializer === undefined ? [] : [initializer];
    }
    case 'MemberExpression':
      return [expression.object];
    case 'CallExpression':
      return callTaintSources(expression, scope.pathModule);
    case 'TemplateLiteral':
      return expression.expressions;
    case 'BinaryExpression':
    case 'LogicalExpression':
      return [expression.left, expression.right];
    case 'ConditionalExpression':
      return [expression.consequent, expression.alternate];
    case 'SpreadElement':
      return [expression.argument];
    default:
      return [];
  }
}

function isTainted(scope, expression) {
  const pending = [expression];
  for (const current of pending) {
    if (current.type === 'Identifier' && isParameter(scope.sourceCode, current)) {
      return true;
    }
    if (pending.length < MAX_TAINT_STEPS) {
      pending.push(...taintSources(scope, current));
    }
  }
  return false;
}

function joinedPath(sourceCode, argument) {
  if (argument?.type === 'Identifier') {
    return { call: constantInitializer(sourceCode, argument), name: argument.name };
  }
  return { call: argument, name: undefined };
}

function escaped(text) {
  return text.replaceAll(/[$]/g, String.raw`\$`);
}

function checksContainment(sourceCode, owner, name) {
  if (name === undefined) {
    return false;
  }
  const variable = escaped(name);
  const checks = [
    String.raw`\b${variable}\.startsWith\(`,
    String.raw`\bresolve\(\s*${variable}\s*\)\.startsWith\(`,
    String.raw`\brelative\([^)]*\b${variable}\b`,
  ];
  const check = new RegExp(checks.join('|'), 'u');
  return check.test(sourceCode.getText(owner));
}

function isUnsafeBuild(scope, call) {
  return (
    call?.type === 'CallExpression' &&
    PATH_BUILDERS.has(importedCalleeName(call.callee, scope.pathModule)) &&
    call.arguments.slice(1).some((segment) => isTainted(scope, segment))
  );
}

function fsBindings(program) {
  const bindings = moduleBindings(program, FS_MODULES);
  for (const [local, imported] of bindings.named) {
    if (imported === 'promises') {
      bindings.namespaces.add(local);
    }
  }
  return bindings;
}

function sinkPaths(call, fs) {
  const name = importedCalleeName(call.callee, fs);
  if (FS_FUNCTIONS.has(name)) {
    return call.arguments.slice(0, TWO_PATH_FUNCTIONS.has(name) ? 2 : 1);
  }
  const isResponseSink =
    call.callee.type === 'MemberExpression' &&
    !call.callee.computed &&
    RESPONSE_SINKS.has(call.callee.property.name);
  return isResponseSink ? call.arguments.slice(0, 1) : [];
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a containment check when a file path is built from a parameter' },
    schema: [],
    messages: {
      unsafePath:
        "A path built from a parameter can leave the base directory with `../`. Resolve it into a variable and check containment on that variable: `const full = path.resolve(base, name); if (!full.startsWith(base + path.sep)) { return { kind: 'outside-base' }; }`. If the parameter is a fixed file name, add an exception for this rule in nitpicker.config.json.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    let fs = { named: new Map(), namespaces: new Set() };
    const scope = { sourceCode, pathModule: { named: new Map(), namespaces: new Set() } };

    function isUnsafeSink(node, argument) {
      const { call, name } = joinedPath(sourceCode, argument);
      if (!isUnsafeBuild(scope, call)) {
        return false;
      }
      const owner = ancestorsOf(node).find((ancestor) => FUNCTION_TYPES.has(ancestor.type));
      return !checksContainment(sourceCode, owner, name);
    }

    return {
      Program(node) {
        fs = fsBindings(node);
        scope.pathModule = moduleBindings(node, PATH_MODULES);
      },
      CallExpression(node) {
        if (sinkPaths(node, fs).some((argument) => isUnsafeSink(node, argument))) {
          context.report({ node, messageId: 'unsafePath' });
        }
      },
    };
  },
};
