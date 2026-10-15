import { ancestorsOf, variableNamed } from '../analysis/ancestry.mjs';
import { importedCalleeName, moduleBindings } from '../analysis/subprocess-calls.mjs';

const FS_MODULES = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises']);
const PATH_MODULES = new Set(['path', 'node:path', 'path/posix', 'node:path/posix']);
const FS_FUNCTIONS = new Set(
  ['readFile', 'writeFile', 'appendFile', 'readdir', 'unlink', 'rm', 'createReadStream']
    .flatMap((name) => [name, `${name}Sync`])
    .concat(['createWriteStream']),
);
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

function taintSources(sourceCode, expression) {
  switch (expression.type) {
    case 'Identifier': {
      const initializer = constantInitializer(sourceCode, expression);
      return initializer === undefined ? [] : [initializer];
    }
    case 'MemberExpression':
      return [expression.object];
    case 'CallExpression':
      return [expression.callee];
    case 'TemplateLiteral':
      return expression.expressions;
    case 'BinaryExpression':
      return [expression.left, expression.right];
    default:
      return [];
  }
}

function isTainted(sourceCode, expression) {
  const pending = [expression];
  for (const current of pending) {
    if (current.type === 'Identifier' && isParameter(sourceCode, current)) {
      return true;
    }
    if (pending.length < MAX_TAINT_STEPS) {
      pending.push(...taintSources(sourceCode, current));
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
  const check = new RegExp(
    String.raw`\b${variable}\.startsWith\(|\brelative\([^)]*\b${variable}\b`,
    'u',
  );
  return check.test(sourceCode.getText(owner));
}

function isUnsafeBuild(sourceCode, call, pathModule) {
  return (
    call?.type === 'CallExpression' &&
    PATH_BUILDERS.has(importedCalleeName(call.callee, pathModule)) &&
    call.arguments.slice(1).some((segment) => isTainted(sourceCode, segment))
  );
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
    let pathModule = { named: new Map(), namespaces: new Set() };

    return {
      Program(node) {
        fs = moduleBindings(node, FS_MODULES);
        pathModule = moduleBindings(node, PATH_MODULES);
      },
      CallExpression(node) {
        if (!FS_FUNCTIONS.has(importedCalleeName(node.callee, fs))) {
          return;
        }
        const { call, name } = joinedPath(sourceCode, node.arguments[0]);
        if (!isUnsafeBuild(sourceCode, call, pathModule)) {
          return;
        }
        const owner = ancestorsOf(node).find((ancestor) => FUNCTION_TYPES.has(ancestor.type));
        if (!checksContainment(sourceCode, owner, name)) {
          context.report({ node, messageId: 'unsafePath' });
        }
      },
    };
  },
};
