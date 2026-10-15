import { ancestorsOf, variableNamed } from '../ancestry.mjs';
import { importedCalleeName, moduleBindings } from '../test-code-analysis.mjs';

const FS_MODULES = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises']);
const PATH_MODULES = new Set(['path', 'node:path', 'path/posix', 'node:path/posix']);
const FS_FUNCTIONS = new Set(
  ['readFile', 'writeFile', 'appendFile', 'readdir', 'unlink', 'rm', 'createReadStream']
    .flatMap((name) => [name, `${name}Sync`])
    .concat(['createWriteStream']),
);
const PATH_BUILDERS = new Set(['join', 'resolve']);
const CONTAINMENT_CHECK = /\.(?:startsWith|relative)\(/;
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

function rootIdentifier(expression) {
  const chain = [expression];
  for (const current of chain) {
    if (current.type === 'MemberExpression') {
      chain.push(current.object);
    }
  }
  return chain.at(-1);
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a containment check when a file path is built from a parameter' },
    schema: [],
    messages: {
      unsafePath:
        "A path built from a parameter can leave the base directory with `../`. Resolve it and check containment first: `const full = path.resolve(base, name); if (!full.startsWith(base + path.sep)) { return { kind: 'outside-base' }; }`. If the parameter is a fixed file name, add an exception for this rule in nitpicker.config.json.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    let fs = { named: new Map(), namespaces: new Set() };
    let pathModule = { named: new Map(), namespaces: new Set() };

    function isParameter(expression) {
      const identifier = rootIdentifier(expression);
      return (
        identifier.type === 'Identifier' &&
        variableNamed(sourceCode, identifier)?.defs.some(({ type }) => type === 'Parameter')
      );
    }

    function pathBuildingCall(argument) {
      if (argument?.type === 'Identifier') {
        const definition = variableNamed(sourceCode, argument)?.defs.at(0);
        return definition?.type === 'Variable' ? definition.node.init : undefined;
      }
      return argument;
    }

    function usesParameter(call) {
      return call.arguments.some(
        (argument) =>
          isParameter(argument) ||
          (argument.type === 'TemplateLiteral' && argument.expressions.some(isParameter)),
      );
    }

    return {
      Program(node) {
        fs = moduleBindings(node, FS_MODULES);
        pathModule = moduleBindings(node, PATH_MODULES);
      },
      CallExpression(node) {
        if (!FS_FUNCTIONS.has(importedCalleeName(node.callee, fs))) {
          return;
        }
        const built = pathBuildingCall(node.arguments[0]);
        if (
          built?.type !== 'CallExpression' ||
          !PATH_BUILDERS.has(importedCalleeName(built.callee, pathModule)) ||
          !usesParameter(built)
        ) {
          return;
        }
        const owner = ancestorsOf(node).find((ancestor) => FUNCTION_TYPES.has(ancestor.type));
        if (!CONTAINMENT_CHECK.test(sourceCode.getText(owner))) {
          context.report({ node, messageId: 'unsafePath' });
        }
      },
    };
  },
};
