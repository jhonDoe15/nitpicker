import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { stringValue } from '../analysis/constant-resolution.mts';
import {
  memberName,
  propertyNamed,
  resolvedValue,
  type Context,
} from '../security/security-values.mts';
import {
  declaredInPackage,
  instanceOf,
  relationNamed,
  relationsTo,
  resultEntity,
  type JoinSite,
  type Relation,
  type Types,
} from './relation-types.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

type MaybeNode = TSESTree.Node | undefined;
type Included = { readonly name: string; readonly relation: Relation };
type WorkItem = {
  readonly owner: TypeScript.Type | undefined;
  readonly include: MaybeNode;
  readonly prefix: string;
  readonly group: number;
};
type Groups = [string, boolean][][];

const FINDS = new Set(['findAll', 'findOne', 'findByPk', 'findAndCountAll', 'findOrCreate']);
const PACKAGES = ['sequelize', 'sequelize-typescript', '@sequelize/core'];
const INCLUDE = 'include';

function entriesOf(context: Context, value: MaybeNode): TSESTree.Node[] {
  const include = resolvedValue(context, value);
  const entries: readonly MaybeNode[] =
    include?.type === AST_NODE_TYPES.ArrayExpression
      ? include.elements.map((element) => element ?? undefined)
      : [include];
  return entries
    .map((entry) => resolvedValue(context, entry))
    .filter((entry) => entry !== undefined);
}

function option(context: Context, entry: TSESTree.Node, name: string): TSESTree.Node | undefined {
  return entry.type === AST_NODE_TYPES.ObjectExpression
    ? resolvedValue(context, propertyNamed(context, entry, name))
    : undefined;
}

function associationName(context: Context, entry: TSESTree.Node): string | undefined {
  if (entry.type !== AST_NODE_TYPES.ObjectExpression) {
    return stringValue(entry);
  }
  const association = option(context, entry, 'association');
  return (
    stringValue(option(context, entry, 'as')) ??
    stringValue(association) ??
    (association?.type === AST_NODE_TYPES.MemberExpression ? memberName(association) : undefined)
  );
}

function byModel(
  types: Types,
  owner: TypeScript.Type | undefined,
  model: TSESTree.Node | undefined,
): Included | undefined {
  const matches = model === undefined ? [] : relationsTo(types, owner, instanceOf(types, model));
  const [match] = matches;
  return matches.length === 1 && match !== undefined
    ? { name: match[0], relation: match[1] }
    : undefined;
}

function includedRelation(
  context: Context,
  types: Types,
  { owner, entry }: { readonly owner: TypeScript.Type | undefined; readonly entry: TSESTree.Node },
): Included | undefined {
  const name = associationName(context, entry);
  if (name !== undefined) {
    const relation = relationNamed(types, owner, name);
    return relation === undefined ? undefined : { name, relation };
  }
  const model =
    entry.type === AST_NODE_TYPES.ObjectExpression ? option(context, entry, 'model') : entry;
  return model?.type === AST_NODE_TYPES.Identifier ||
    model?.type === AST_NODE_TYPES.MemberExpression
    ? byModel(types, owner, model)
    : undefined;
}

function isTrue(node: MaybeNode): boolean {
  return node?.type === AST_NODE_TYPES.Literal && node.value === true;
}

function nestedWork(
  context: Context,
  types: Types,
  {
    item,
    entry,
    groups,
  }: { readonly item: WorkItem; readonly entry: TSESTree.Node; readonly groups: Groups },
): WorkItem[] {
  const found =
    option(context, entry, 'all') === undefined
      ? includedRelation(context, types, { owner: item.owner, entry })
      : undefined;
  if (found === undefined) {
    return [];
  }
  const key = item.prefix === '' ? found.name : `${item.prefix}.${found.name}`;
  const separate = isTrue(option(context, entry, 'separate'));
  if (!separate) {
    groups[item.group]?.push([key, found.relation.many]);
  }
  const group = separate ? groups.push([]) - 1 : item.group;
  return [
    { owner: found.relation.target, include: option(context, entry, INCLUDE), prefix: key, group },
  ];
}

function groupsOf(context: Context, types: Types, root: Omit<WorkItem, 'group'>): Groups {
  const groups: Groups = [[]];
  const pending: WorkItem[] = [{ ...root, group: 0 }];
  for (const item of pending) {
    const entries = item.include === undefined ? [] : entriesOf(context, item.include);
    appendAll(
      pending,
      entries.flatMap((entry) => nestedWork(context, types, { item, entry, groups })),
    );
  }
  return groups;
}

export function includeJoins(
  context: Context,
  types: Types,
  call: TSESTree.CallExpression,
): JoinSite[] {
  const name =
    call.callee.type === AST_NODE_TYPES.MemberExpression ? memberName(call.callee) : undefined;
  if (name === undefined || !FINDS.has(name)) {
    return [];
  }
  const options = call.arguments
    .map((argument) => resolvedValue(context, argument))
    .findLast(
      (argument) =>
        argument?.type === AST_NODE_TYPES.ObjectExpression &&
        propertyNamed(context, argument, INCLUDE) !== undefined,
    );
  if (options === undefined || !declaredInPackage(types, call, PACKAGES)) {
    return [];
  }
  const groups = groupsOf(context, types, {
    owner: resultEntity(types, call),
    include: propertyNamed(context, options, INCLUDE),
    prefix: '',
  });
  return groups.map((joined) => ({ orm: 'sequelize', node: options, joined: new Map(joined) }));
}

export type TopInclude = {
  readonly entry: TSESTree.Node;
  readonly name: string;
  readonly many: boolean;
};

export function topLevelIncludes(
  context: Context,
  types: Types,
  {
    call,
    options,
  }: { readonly call: TSESTree.CallExpression; readonly options: TSESTree.ObjectExpression },
): TopInclude[] {
  const owner = resultEntity(types, call);
  return entriesOf(context, propertyNamed(context, options, INCLUDE)).flatMap((entry) => {
    const found = includedRelation(context, types, { owner, entry });
    return found === undefined ? [] : [{ entry, name: found.name, many: found.relation.many }];
  });
}
