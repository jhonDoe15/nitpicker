import { stringValue } from '../analysis/constant-resolution.mjs';
import { memberName, propertyNamed, resolvedValue } from '../security/security-values.mjs';
import {
  declaredInPackage,
  instanceOf,
  relationNamed,
  relationsTo,
  resultEntity,
} from './relation-types.mjs';

const FINDS = new Set(['findAll', 'findOne', 'findByPk', 'findAndCountAll', 'findOrCreate']);
const PACKAGES = ['sequelize', 'sequelize-typescript', '@sequelize/core'];
const INCLUDE = 'include';

function entriesOf(context, value) {
  const include = resolvedValue(context, value);
  const entries = include?.type === 'ArrayExpression' ? include.elements : [include];
  return entries.map((entry) => resolvedValue(context, entry)).filter(Boolean);
}

function option(context, entry, name) {
  return entry.type === 'ObjectExpression'
    ? resolvedValue(context, propertyNamed(context, entry, name))
    : undefined;
}

function associationName(context, entry) {
  if (entry.type !== 'ObjectExpression') {
    return stringValue(entry);
  }
  const association = option(context, entry, 'association');
  return (
    stringValue(option(context, entry, 'as')) ??
    stringValue(association) ??
    (association?.type === 'MemberExpression' ? memberName(association) : undefined)
  );
}

function byModel(types, owner, model) {
  const matches = model === undefined ? [] : relationsTo(types, owner, instanceOf(types, model));
  return matches.length === 1 ? { name: matches[0][0], relation: matches[0][1] } : undefined;
}

function includedRelation(context, types, owner, entry) {
  const name = associationName(context, entry);
  if (name !== undefined) {
    const relation = relationNamed(types, owner, name);
    return relation === undefined ? undefined : { name, relation };
  }
  const model = entry.type === 'ObjectExpression' ? option(context, entry, 'model') : entry;
  return model?.type === 'Identifier' || model?.type === 'MemberExpression'
    ? byModel(types, owner, model)
    : undefined;
}

function isTrue(node) {
  return node?.type === 'Literal' && node.value === true;
}

function entryGroups(context, types, { owner, entry, prefix }) {
  const found =
    option(context, entry, 'all') === undefined
      ? includedRelation(context, types, owner, entry)
      : undefined;
  if (found === undefined) {
    return { joined: [], separate: [] };
  }
  const key = prefix === '' ? found.name : `${prefix}.${found.name}`;
  const nested = groupsOf(context, types, {
    owner: found.relation.target,
    include: option(context, entry, INCLUDE),
    prefix: key,
  });
  if (isTrue(option(context, entry, 'separate'))) {
    return { joined: [], separate: nested };
  }
  const [same, ...separate] = nested;
  return { joined: [[key, found.relation.many], ...same], separate };
}

function groupsOf(context, types, { owner, include, prefix }) {
  const results =
    include === undefined
      ? []
      : entriesOf(context, include).map((entry) =>
          entryGroups(context, types, { owner, entry, prefix }),
        );
  return [
    results.flatMap((result) => result.joined),
    ...results.flatMap((result) => result.separate),
  ];
}

export function includeJoins(context, types, call) {
  if (call.callee.type !== 'MemberExpression' || !FINDS.has(memberName(call.callee))) {
    return [];
  }
  const options = call.arguments
    .map((argument) => resolvedValue(context, argument))
    .findLast(
      (argument) =>
        argument?.type === 'ObjectExpression' &&
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
