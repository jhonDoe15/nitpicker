import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { variableNamed } from '../analysis/ancestry.mjs';
import { isConcatenation } from '../analysis/static-shapes.mjs';
import { importedCalleeName, moduleBindings } from '../analysis/subprocess-calls.mjs';
import { isContained, unwrapped } from './path-containment.mjs';

const FS_MODULES = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises']);
const PATH_MODULES = new Set(['path', 'node:path', 'path/posix', 'node:path/posix']);
const TWO_PATH_FUNCTIONS = new Set(
  ['rename', 'copyFile', 'cp', 'symlink', 'link'].flatMap((name) => [name, `${name}Sync`]),
);
const FS_FUNCTIONS = new Set(
  [
    'readFile',
    'writeFile',
    'appendFile',
    'readdir',
    'unlink',
    'rm',
    'rmdir',
    'stat',
    'lstat',
    'access',
    'exists',
    'mkdir',
    'open',
    'opendir',
    'readlink',
    'realpath',
    'truncate',
    'chmod',
    'chown',
    'utimes',
    'createReadStream',
  ]
    .flatMap((name) => [name, `${name}Sync`])
    .concat(['createWriteStream', 'watch', ...TWO_PATH_FUNCTIONS]),
);
const RESPONSE_SINKS = new Set(['sendFile']);
const PATH_BUILDERS = new Set(['join', 'resolve', 'normalize']);
const MAX_TAINT_STEPS = 50;

function boundValues(sourceCode, identifier) {
  const variable = variableNamed(sourceCode, identifier);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (definition?.type !== 'Variable') {
    return [];
  }
  const writes = variable.references
    .filter((reference) => reference.isWrite() && reference.writeExpr)
    .map((reference) => reference.writeExpr);
  return [...new Set([definition.node.init, ...writes].filter(Boolean))];
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
  const inner = unwrapped(expression);
  if (inner !== expression) {
    return [inner];
  }
  switch (expression.type) {
    case 'Identifier':
      return boundValues(scope.sourceCode, expression);
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

function concatenationOperands(node) {
  return isConcatenation(node) ? [node.left, node.right] : [];
}

function concatenated(expression) {
  const leaves = [...depthFirst(expression, concatenationOperands)];
  return leaves.filter((node) => !isConcatenation(node));
}

function pathParts(scope, node) {
  if (node.type === 'CallExpression') {
    const builds = PATH_BUILDERS.has(importedCalleeName(node.callee, scope.pathModule));
    return builds ? node.arguments : undefined;
  }
  if (node.type === 'TemplateLiteral') {
    const startsWithText = node.quasis[0].value.cooked !== '';
    return startsWithText ? [undefined, ...node.expressions] : node.expressions;
  }
  return isConcatenation(node) ? concatenated(node) : undefined;
}

function isUnsafeBuild(scope, expression) {
  const pending = [expression];
  for (const current of pending) {
    const node = unwrapped(current);
    const parts = node.type === 'Identifier' ? undefined : pathParts(scope, node);
    if (parts?.slice(1).some((segment) => segment && isTainted(scope, segment))) {
      return true;
    }
    if (pending.length < MAX_TAINT_STEPS) {
      const next = node.type === 'Identifier' ? boundValues(scope.sourceCode, node) : parts;
      pending.push(...(next ?? []).filter(Boolean));
    }
  }
  return false;
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
        "A path built from a parameter can leave the base directory with `../`. Resolve it into a variable and check containment on that variable in an `if` that returns or throws: `const full = path.resolve(base, name); if (!full.startsWith(base + path.sep)) { return { kind: 'outside-base' }; }`. An exception fits only when the parameter is a fixed file name.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    let fs = { named: new Map(), namespaces: new Set() };
    const scope = {
      context,
      sourceCode,
      pathModule: { named: new Map(), namespaces: new Set() },
    };

    function isUnsafeSink(node, argument) {
      return isUnsafeBuild(scope, argument) && !isContained(scope, node, argument);
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
