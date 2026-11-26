import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, contains, depthFirst, nodeChildren } from '../typed/node-views.mts';
import { calleeNameOf, isCallExpression, isFunction } from '../typed/syntax-views.mts';
import type { BatchFunction } from './batch-inputs.mts';

const READS = new Set(['readFile', 'readFileSync']);
const PARSER_MODULES = new Set([
  'yaml',
  'js-yaml',
  'toml',
  '@iarna/toml',
  'smol-toml',
  'json5',
  'acorn',
  'espree',
  'esprima',
  '@babel/parser',
  '@typescript-eslint/parser',
  '@typescript-eslint/typescript-estree',
]);

function importedFromParser(
  call: TSESTree.CallExpression,
  local: string,
  member: boolean,
): boolean {
  const program = ancestorsOf(call).find((ancestor) => ancestor.type === AST_NODE_TYPES.Program);
  return (
    program?.type === AST_NODE_TYPES.Program &&
    program.body.some(
      (statement) =>
        statement.type === AST_NODE_TYPES.ImportDeclaration &&
        PARSER_MODULES.has(String(statement.source.value)) &&
        statement.specifiers.some(
          (specifier) =>
            specifier.local.name === local &&
            (member
              ? true
              : specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                nameOfImported(specifier) === 'parse'),
        ),
    )
  );
}

function nameOfImported(specifier: TSESTree.ImportSpecifier): string {
  return specifier.imported.type === AST_NODE_TYPES.Identifier
    ? specifier.imported.name
    : String(specifier.imported.value);
}

function isFailingParse(call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return importedFromParser(call, callee.name, false);
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'parse' &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    (callee.object.name === 'JSON' || importedFromParser(call, callee.object.name, true))
  );
}

function isFailingCall(node: TSESTree.CallExpression): boolean {
  const name = calleeNameOf(node.callee);
  return name !== undefined && (READS.has(name) || isFailingParse(node));
}

function isHandled(call: TSESTree.CallExpression, within: BatchFunction): boolean {
  return ancestorsOf(call).some(
    (ancestor) =>
      contains(within, ancestor) &&
      ((ancestor.type === AST_NODE_TYPES.TryStatement &&
        ancestor.handler !== null &&
        contains(ancestor.block, call)) ||
        (isCallExpression(ancestor) &&
          ancestor.callee.type === AST_NODE_TYPES.MemberExpression &&
          ['catch', 'then'].includes(calleeNameOf(ancestor.callee) ?? '') &&
          (ancestor.arguments.length > 1 || calleeNameOf(ancestor.callee) === 'catch') &&
          contains(ancestor.callee.object, call))),
  );
}

export function unhandledFailingCall(callback: BatchFunction): TSESTree.CallExpression | undefined {
  return [
    ...depthFirst<TSESTree.Node>(callback.body, (node) =>
      isFunction(node) ? [] : nodeChildren(node),
    ),
  ]
    .filter(isCallExpression)
    .find((call) => isFailingCall(call) && !isHandled(call, callback));
}
