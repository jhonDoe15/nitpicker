import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { calleeFamily, PRISMA } from '../../../rules/queries/receivers/orm-callee.mts';
import { memberName, type Context } from '../../../rules/security/security-values.mts';
import type { TextEdit } from '../../edits/text.mts';
import { isPlainObject, keyName } from '../../support/objects.mts';
import { projectMentions } from '../../support/project/program.mts';

const WHERE = 'where';
const HOOKS = ['$use(', '$extends('];
const DROPPED = new Set(['orderBy', 'select', 'include', 'omit', 'relationLoadStrategy']);

function optionEdits(
  context: Context,
  options: TSESTree.CallExpressionArgument,
): TextEdit[] | undefined {
  if (!isPlainObject(options)) {
    return undefined;
  }
  const keys = options.properties.map((property) => keyName(property));
  if (!keys.every((key) => key !== undefined && (key === WHERE || DROPPED.has(key)))) {
    return undefined;
  }
  if (keys.every((key) => key === WHERE)) {
    return [];
  }
  const where = options.properties.find((property) => keyName(property) === WHERE);
  const text = where === undefined ? '' : `{ ${context.sourceCode.getText(where)} }`;
  return [{ range: options.range, text }];
}

export function prismaCountEdits(
  context: Context,
  call: TSESTree.CallExpression,
): TextEdit[] | undefined {
  const { callee } = call;
  const named =
    callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
      ? memberName(callee) === 'findMany'
      : false;
  if (
    !named ||
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    call.arguments.length > 1 ||
    calleeFamily(context, call) !== PRISMA ||
    projectMentions(context, HOOKS)
  ) {
    return undefined;
  }
  const [options] = call.arguments;
  const rest = options === undefined ? [] : optionEdits(context, options);
  return rest === undefined
    ? undefined
    : [{ range: callee.property.range, text: 'count' }, ...rest];
}
