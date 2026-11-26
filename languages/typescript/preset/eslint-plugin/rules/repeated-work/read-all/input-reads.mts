import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName } from '../../collections/costly-forms/repeated-runs.mts';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { soleReturnedValue, unwrapped, isFunction } from '../../typed/syntax-views.mts';
import { isFsRead } from '../early-exits/pure-work.mts';

const READS = new Set(['readFile', 'readFileSync', 'readJson', 'readJsonSync']);

export function isJsonParse(sourceCode: SourceCode, callee: TSESTree.Node): boolean {
  const owner =
    callee.type === AST_NODE_TYPES.MemberExpression ? unwrapped(callee.object) : undefined;
  const variable =
    owner?.type === AST_NODE_TYPES.Identifier ? variableNamed(sourceCode, owner) : undefined;
  return (
    owner?.type === AST_NODE_TYPES.Identifier &&
    owner.name === 'JSON' &&
    memberName(callee) === 'parse' &&
    (variable === undefined || variable.defs.length === 0)
  );
}

export function isInputRead(sourceCode: SourceCode, node: TSESTree.Node | undefined): boolean {
  const pending = [node];
  for (const item of pending) {
    const value = item === undefined ? undefined : unwrapped(item);
    if (value?.type === AST_NODE_TYPES.AwaitExpression) {
      pending.push(value.argument);
      continue;
    }
    if (value?.type !== AST_NODE_TYPES.CallExpression) {
      return false;
    }
    const callee = unwrapped(value.callee);
    if (isJsonParse(sourceCode, callee)) {
      pending.push(value.arguments[0]);
      continue;
    }
    const name =
      callee.type === AST_NODE_TYPES.Identifier ? callee.name : (memberName(callee) ?? '');
    return READS.has(name) && isFsRead(sourceCode, callee);
  }
  return false;
}

export function readsPerElement(sourceCode: SourceCode, fn: TSESTree.Node | undefined): boolean {
  return fn !== undefined && isFunction(fn) && isInputRead(sourceCode, soleReturnedValue(fn));
}

export function isLiteralList(node: TSESTree.Node): boolean {
  return unwrapped(node).type === AST_NODE_TYPES.ArrayExpression;
}
