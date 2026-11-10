import { stringValue } from '../analysis/constant-resolution.mjs';
import { ancestorsOf, chainOf, variableNamed } from '../analysis/ancestry.mjs';
import { memberName } from '../security/security-values.mjs';
import { declaredInPackage, instanceOf, relationNamed, typeArgumentOf } from './relation-types.mjs';

const BUILDER = 'createQueryBuilder';
const FROM = 'from';
const CLONE = 'clone';
const BLOCKS = new Set(['BlockStatement', 'Program', 'StaticBlock', 'SwitchCase']);
const JOIN_SELECTS = new Set(['leftJoinAndSelect', 'innerJoinAndSelect']);

function chainedCall(node) {
  const member = node.parent;
  const call = member?.parent;
  return member?.type === 'MemberExpression' &&
    member.object === node &&
    call?.type === 'CallExpression' &&
    call.callee === member
    ? call
    : undefined;
}

function callsAfter(node) {
  return chainOf(chainedCall(node), chainedCall);
}

function enclosingBlock(node) {
  return ancestorsOf(node).find(({ type }) => BLOCKS.has(type));
}

function heldIn(sourceCode, node) {
  const declarator = (callsAfter(node).at(-1) ?? node).parent;
  if (declarator?.type !== 'VariableDeclarator' || declarator.id.type !== 'Identifier') {
    return [];
  }
  const variable = variableNamed(sourceCode, declarator.id);
  const block = enclosingBlock(declarator);
  return (variable?.references ?? [])
    .filter((reference) => reference.identifier !== declarator.id && reference.isRead())
    .filter((reference) => enclosingBlock(reference.identifier) === block)
    .map((reference) => callsAfter(reference.identifier))
    .filter((calls) => calls.length > 0 && memberName(calls[0].callee) !== CLONE)
    .flat();
}

function rootAlias(types, builder) {
  const [first, second] = builder.arguments;
  const alias = stringValue(first) ?? stringValue(second);
  return alias === undefined ? undefined : { alias, type: typeArgumentOf(types, builder) };
}

function fromAlias(types, call) {
  const alias = stringValue(call.arguments[1]);
  return alias === undefined ? undefined : { alias, type: instanceOf(types, call.arguments[0]) };
}

function joinedRelation(types, aliases, call) {
  const [property, alias] = call.arguments.map((argument) => stringValue(argument));
  const [owner, name, ...rest] = property?.split('.') ?? [];
  const parent = aliases.get(owner);
  const relation =
    parent === undefined || rest.length > 0 ? undefined : relationNamed(types, parent.type, name);
  if (relation === undefined || alias === undefined) {
    return undefined;
  }
  const key = parent.key === '' ? name : `${parent.key}.${name}`;
  aliases.set(alias, { key, type: relation.target });
  return [key, relation.many];
}

function visit(types, aliases, call) {
  const name = memberName(call.callee);
  if (name === FROM) {
    const from = fromAlias(types, call);
    if (from !== undefined) {
      aliases.set(from.alias, { key: '', type: from.type });
    }
  }
  return JOIN_SELECTS.has(name) ? joinedRelation(types, aliases, call) : undefined;
}

export function isQueryBuilder(types, call) {
  return (
    call.callee.type === 'MemberExpression' &&
    memberName(call.callee) === BUILDER &&
    declaredInPackage(types, call, ['typeorm'])
  );
}

export function builderJoins(context, types, builder) {
  const root = rootAlias(types, builder);
  const aliases = new Map(root === undefined ? [] : [[root.alias, { key: '', type: root.type }]]);
  const calls = [...callsAfter(builder), ...heldIn(context.sourceCode, builder)];
  const joins = calls.map((call) => [call, visit(types, aliases, call)]).filter(([, join]) => join);
  return {
    orm: 'typeorm',
    node: joins.findLast(([, [, many]]) => many)?.[0] ?? builder,
    joined: new Map(joins.map(([, join]) => join)),
  };
}
