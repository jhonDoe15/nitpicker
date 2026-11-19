import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { calleeDeclaration, calleeFamily } from '../../../rules/queries/receivers/orm-callee.mts';
import { TYPEORM } from '../../../rules/database/orm-modules.mts';
import { memberName, type Context } from '../../../rules/security/security-values.mts';
import type { TextEdit } from '../../edits/text.mts';
import { isPlainObject, keyName } from '../../support/objects.mts';
import { hasProperty } from '../../../rules/support/checked-types.mts';
import { ownerIndex } from '../typeorm-receivers.mts';

const KEPT = new Set(['where', 'withDeleted']);
const DROPPED = new Set(['relations', 'order', 'loadEagerRelations', 'select']);
const RENAMED = new Map([
  ['find', 'count'],
  ['findBy', 'countBy'],
]);

function allowed(keys: readonly (string | undefined)[]): boolean {
  const known = keys.every((key) => key !== undefined && (KEPT.has(key) || DROPPED.has(key)));
  return known && !(keys.includes('select') && keys.includes('relations'));
}

function optionEdits(
  context: Context,
  {
    options,
    previous,
  }: { options: TSESTree.CallExpressionArgument | undefined; previous: TSESTree.Node | undefined },
): TextEdit[] | undefined {
  if (options === undefined) {
    return [];
  }
  if (!(
    isPlainObject(options) && allowed(options.properties.map((property) => keyName(property)))
  )) {
    return undefined;
  }
  const kept = options.properties.filter((property) => KEPT.has(keyName(property) ?? ''));
  if (kept.length === options.properties.length) {
    return [];
  }
  if (kept.length === 0) {
    return [{ range: [previous?.range[1] ?? options.range[0], options.range[1]], text: '' }];
  }
  const text = kept.map((property) => context.sourceCode.getText(property)).join(', ');
  return [{ range: options.range, text: `{ ${text} }` }];
}

export function typeormCountEdits(
  context: Context,
  call: TSESTree.CallExpression,
): TextEdit[] | undefined {
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return undefined;
  }
  const method = memberName(callee) ?? '';
  const renamed = RENAMED.get(method);
  const index = ownerIndex(calleeDeclaration(context, call));
  const fits =
    renamed !== undefined &&
    index !== undefined &&
    calleeFamily(context, call) === TYPEORM &&
    hasProperty(context, callee.object, renamed) &&
    call.arguments.length <= index + 1 &&
    call.arguments.every((argument) => argument.type !== AST_NODE_TYPES.SpreadElement);
  if (!fits) {
    return undefined;
  }
  const options =
    method === 'find'
      ? optionEdits(context, {
          options: call.arguments[index],
          previous: call.arguments[index - 1],
        })
      : [];
  const rename = { range: callee.property.range, text: renamed };
  return options === undefined ? undefined : [rename, ...options];
}
