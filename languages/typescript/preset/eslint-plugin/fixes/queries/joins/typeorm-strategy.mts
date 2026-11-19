import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import {
  relationNamed,
  resultEntity,
  type JoinSite,
  type Types,
} from '../../../rules/joins/relation-types.mts';
import {
  memberName,
  propertyNamed,
  type Context,
} from '../../../rules/security/security-values.mts';
import { addingProperty, valueOf } from '../../support/objects.mts';
import type { FixPlan } from '../../support/ranges.mts';
import { avoidsRelations, hasOnlyKeys, isEagerType, optionAccepts } from './option-types.mts';

const FINDS = new Set(['find', 'findOne', 'findOneOrFail', 'findAndCount']);
const KEYS = new Set(['relations', 'where', 'order', 'take', 'skip', 'withDeleted']);

function joinedTypes(
  types: Types,
  root: TypeScript.Type | undefined,
  paths: Iterable<string>,
): (TypeScript.Type | undefined)[] {
  const found = [root];
  for (const path of paths) {
    path.split('.').reduce<TypeScript.Type | undefined>((owner, segment) => {
      const target = relationNamed(types, owner, segment)?.target;
      found.push(target);
      return target;
    }, root);
  }
  return found;
}

function isBounded(name: string, options: TSESTree.ObjectExpression): boolean {
  return name.startsWith('findOne') || valueOf(options, 'take') !== undefined;
}

export function typeormStrategyFix(
  context: Context,
  types: Types,
  { join, call }: { readonly join: JoinSite; readonly call: TSESTree.CallExpression },
): FixPlan | undefined {
  const { node: options } = join;
  const { callee } = call;
  const name = callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
  if (
    options.type !== AST_NODE_TYPES.ObjectExpression ||
    name === undefined ||
    !FINDS.has(name) ||
    !call.arguments.includes(options) ||
    !hasOnlyKeys(options, KEYS) ||
    !isBounded(name, options)
  ) {
    return undefined;
  }
  const relations = new Set([...join.joined.keys()].map((path) => path.split('.')[0] ?? ''));
  const eager = joinedTypes(types, resultEntity(types, call), join.joined.keys()).some(isEagerType);
  const clean =
    !eager &&
    avoidsRelations(valueOf(options, 'where'), relations) &&
    avoidsRelations(valueOf(options, 'order'), relations) &&
    propertyNamed(context, options, 'relations') !== undefined &&
    optionAccepts(context, options, { key: 'relationLoadStrategy', literal: 'query' });
  return clean
    ? addingProperty(context.sourceCode, options, "relationLoadStrategy: 'query'")
    : undefined;
}
