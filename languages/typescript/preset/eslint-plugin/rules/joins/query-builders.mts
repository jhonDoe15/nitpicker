import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { stringValue } from '../analysis/constant-resolution.mts';
import { ancestorsOf, chainOf, variableNamed, type SourceCode } from '../typed/node-views.mts';
import { memberName, type Context } from '../security/security-values.mts';
import {
  declaredInPackage,
  instanceOf,
  relationNamed,
  typeArgumentOf,
  type JoinSite,
  type Types,
} from './relation-types.mts';

type MemberCall = TSESTree.CallExpression & { readonly callee: TSESTree.MemberExpression };
type AliasEntry = { readonly key: string; readonly type: TypeScript.Type | undefined };
type Join = readonly [string, boolean];

const BUILDER = 'createQueryBuilder';
const FROM = 'from';
const CLONE = 'clone';
const BLOCKS = new Set<string>([
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.Program,
  AST_NODE_TYPES.StaticBlock,
  AST_NODE_TYPES.SwitchCase,
]);
const JOIN_SELECTS = new Set(['leftJoinAndSelect', 'innerJoinAndSelect']);

function isCalleeOf(
  call: TSESTree.CallExpression,
  member: TSESTree.MemberExpression,
): call is MemberCall {
  return call.callee === member;
}

function chainedCall(node: TSESTree.Node): MemberCall | undefined {
  const member = node.parent;
  const call = member?.parent;
  return member?.type === AST_NODE_TYPES.MemberExpression &&
    member.object === node &&
    call?.type === AST_NODE_TYPES.CallExpression &&
    isCalleeOf(call, member)
    ? call
    : undefined;
}

function callsAfter(node: TSESTree.Node): MemberCall[] {
  return chainOf<MemberCall>(chainedCall(node), chainedCall);
}

function enclosingBlock(node: TSESTree.Node): TSESTree.Node | undefined {
  return ancestorsOf(node).find(({ type }) => BLOCKS.has(type));
}

function heldIn(sourceCode: SourceCode, node: TSESTree.Node): MemberCall[] {
  const declarator = (callsAfter(node).at(-1) ?? node).parent;
  if (
    declarator?.type !== AST_NODE_TYPES.VariableDeclarator ||
    declarator.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return [];
  }
  const variable = variableNamed(sourceCode, declarator.id);
  const block = enclosingBlock(declarator);
  return (variable?.references ?? [])
    .filter((reference) => reference.identifier !== declarator.id && reference.isRead())
    .filter((reference) => enclosingBlock(reference.identifier) === block)
    .map((reference) => callsAfter(reference.identifier))
    .filter((calls) => {
      const [first] = calls;
      return first !== undefined && memberName(first.callee) !== CLONE;
    })
    .flat();
}

function rootAlias(
  types: Types,
  builder: TSESTree.CallExpression,
): { readonly alias: string; readonly type: TypeScript.Type | undefined } | undefined {
  const [first, second] = builder.arguments;
  const alias = stringValue(first) ?? stringValue(second);
  return alias === undefined ? undefined : { alias, type: typeArgumentOf(types, builder) };
}

function fromAlias(
  types: Types,
  call: MemberCall,
): { readonly alias: string; readonly type: TypeScript.Type | undefined } | undefined {
  const [source, second] = call.arguments;
  const alias = stringValue(second);
  return alias === undefined || source === undefined
    ? undefined
    : { alias, type: instanceOf(types, source) };
}

function joinedRelation(
  types: Types,
  aliases: Map<string, AliasEntry>,
  call: MemberCall,
): Join | undefined {
  const [property, alias] = call.arguments.map((argument) => stringValue(argument));
  const [owner, name, ...rest] = property?.split('.') ?? [];
  const parent = owner === undefined ? undefined : aliases.get(owner);
  const relation =
    parent === undefined || name === undefined || rest.length > 0
      ? undefined
      : relationNamed(types, parent.type, name);
  if (parent === undefined || name === undefined || relation === undefined || alias === undefined) {
    return undefined;
  }
  const key = parent.key === '' ? name : `${parent.key}.${name}`;
  aliases.set(alias, { key, type: relation.target });
  return [key, relation.many];
}

function visit(types: Types, aliases: Map<string, AliasEntry>, call: MemberCall): Join | undefined {
  const name = memberName(call.callee);
  if (name === FROM) {
    const from = fromAlias(types, call);
    if (from !== undefined) {
      aliases.set(from.alias, { key: '', type: from.type });
    }
  }
  return name !== undefined && JOIN_SELECTS.has(name)
    ? joinedRelation(types, aliases, call)
    : undefined;
}

export function isQueryBuilder(types: Types, call: TSESTree.CallExpression): boolean {
  return (
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    memberName(call.callee) === BUILDER &&
    declaredInPackage(types, call, ['typeorm'])
  );
}

export function builderJoins(
  context: Context,
  types: Types,
  builder: TSESTree.CallExpression,
): JoinSite {
  const root = rootAlias(types, builder);
  const aliases = new Map<string, AliasEntry>(
    root === undefined ? [] : [[root.alias, { key: '', type: root.type }]],
  );
  const calls = [...callsAfter(builder), ...heldIn(context.sourceCode, builder)];
  const joins = calls.flatMap((call) => {
    const join = visit(types, aliases, call);
    return join === undefined ? [] : [{ call, join }];
  });
  return {
    orm: 'typeorm',
    node: joins.findLast(({ join }) => join[1])?.call ?? builder,
    joined: new Map(joins.map(({ join }) => join)),
  };
}
