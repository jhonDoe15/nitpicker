import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { resultEntity, type JoinSite, type Types } from '../../../rules/joins/relation-types.mts';
import { topLevelIncludes, type TopInclude } from '../../../rules/joins/sequelize-includes.mts';
import {
  memberName,
  typeServices,
  type Context,
} from '../../../rules/security/security-values.mts';
import { allOf } from '../../edits/plans.mts';
import { addingProperty, isPlainObject, keyName } from '../../support/objects.mts';
import { projectMentions } from '../../support/project/program.mts';
import { replacing, type FixPlan } from '../../support/ranges.mts';
import { avoidsRelations, hasOnlyKeys } from './option-types.mts';
import { isHasMany } from './sequelize-associations.mts';

const KEYS = new Set(['include', 'where', 'limit', 'offset', 'distinct', 'order']);
const ENTRY_KEYS = new Set(['model', 'as', 'association']);
const HOOKS = ['beforeFind', 'BeforeFind', 'addHook(', 'afterFind', 'AfterFind', 'defaultScope'];
const COLUMN_PATH = /[.$]/u;

function isColumnOrder(node: TSESTree.Node | undefined): boolean {
  if (node === undefined) {
    return true;
  }
  const isColumn = (item: TSESTree.Node | null): boolean =>
    item?.type === AST_NODE_TYPES.Literal &&
    typeof item.value === 'string' &&
    !COLUMN_PATH.test(item.value);
  return (
    node.type === AST_NODE_TYPES.ArrayExpression &&
    node.elements.every(
      (item) =>
        isColumn(item) ||
        (item?.type === AST_NODE_TYPES.ArrayExpression && item.elements.every(isColumn)),
    )
  );
}

function valueOf(options: TSESTree.ObjectExpression, key: string): TSESTree.Node | undefined {
  const property = options.properties.find((each) => keyName(each) === key);
  return property?.type === AST_NODE_TYPES.Property ? property.value : undefined;
}

function isPlainWhere(node: TSESTree.Node | undefined): boolean {
  return (
    node === undefined ||
    (isPlainObject(node) &&
      node.properties.every((property) => !COLUMN_PATH.test(keyName(property) ?? '.')))
  );
}

function ownerName(types: Types, call: TSESTree.CallExpression): string | undefined {
  const entity = resultEntity(types, call);
  return (entity?.aliasSymbol ?? entity?.getSymbol())?.getName();
}

function entryPlan(context: Context, include: TopInclude): FixPlan | undefined {
  const { entry } = include;
  const text = context.sourceCode.getText(entry);
  if (entry.type === AST_NODE_TYPES.Literal) {
    return replacing(entry.range, `{ association: ${text}, separate: true }`);
  }
  if (entry.type === AST_NODE_TYPES.Identifier || entry.type === AST_NODE_TYPES.MemberExpression) {
    return replacing(entry.range, `{ model: ${text}, separate: true }`);
  }
  return entry.type === AST_NODE_TYPES.ObjectExpression && hasOnlyKeys(entry, ENTRY_KEYS)
    ? addingProperty(context.sourceCode, entry, 'separate: true')
    : undefined;
}

function separated(
  program: TypeScript.Program,
  { owner, joined }: { readonly owner: string; readonly joined: ReadonlyMap<string, boolean> },
  includes: readonly TopInclude[],
): TopInclude[] | undefined {
  const names = [...joined.keys()];
  const many = [...joined].filter(([, isMany]) => isMany).map(([name]) => name);
  const chosen = many.slice(1).map((name) => includes.find((each) => each.name === name));
  const proven = chosen.every(
    (each) => each?.many === true && isHasMany(program, { owner, name: each.name }),
  );
  return !proven || names.some((name) => name.includes('.'))
    ? undefined
    : chosen.filter((each) => each !== undefined);
}

export function sequelizeSeparateFix(
  context: Context,
  types: Types,
  { join, call }: { readonly join: JoinSite; readonly call: TSESTree.CallExpression },
): ReturnType<typeof allOf> {
  const { node: options } = join;
  const method =
    call.callee.type === AST_NODE_TYPES.MemberExpression ? memberName(call.callee) : '';
  const owner = ownerName(types, call);
  const program = typeServices(context)?.program;
  const include =
    options.type === AST_NODE_TYPES.ObjectExpression ? valueOf(options, 'include') : undefined;
  const distinct =
    options.type === AST_NODE_TYPES.ObjectExpression ? valueOf(options, 'distinct') : undefined;
  const fits =
    options.type === AST_NODE_TYPES.ObjectExpression &&
    program !== undefined &&
    owner !== undefined &&
    call.arguments.includes(options) &&
    hasOnlyKeys(options, KEYS) &&
    include?.type === AST_NODE_TYPES.ArrayExpression &&
    isPlainWhere(valueOf(options, 'where')) &&
    avoidsRelations(valueOf(options, 'where'), new Set()) &&
    isColumnOrder(valueOf(options, 'order')) &&
    (method !== 'findAndCountAll' ||
      (distinct?.type === AST_NODE_TYPES.Literal && distinct.value === true)) &&
    !projectMentions(context, HOOKS);
  if (!fits) {
    return undefined;
  }
  const includes = topLevelIncludes(context, types, { call, options });
  const direct = includes.filter((each) => each.entry.parent === include);
  const chosen =
    direct.length === includes.length
      ? separated(program, { owner, joined: join.joined }, direct)
      : undefined;
  return chosen === undefined ? undefined : allOf(chosen.map((each) => entryPlan(context, each)));
}
