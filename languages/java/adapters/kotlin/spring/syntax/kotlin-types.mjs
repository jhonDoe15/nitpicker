import { kid, kids, textOf } from './kotlin-tree.mjs';

function userTypeOf(reference) {
  return kid(kid(reference, 'NULLABLE_TYPE') ?? reference, 'USER_TYPE');
}

function writtenName(source, userType) {
  const names = [];
  const pending = [userType];
  for (const current of pending) {
    names.unshift(textOf(source, kid(current, 'REFERENCE_EXPRESSION')));
    const qualifier = kid(current, 'USER_TYPE');
    if (qualifier !== undefined) {
      pending.push(qualifier);
    }
  }
  return names.join('.');
}

function shellOf(source, reference) {
  const userType = reference === undefined ? undefined : userTypeOf(reference);
  if (userType === undefined) {
    return undefined;
  }
  return {
    type: {
      node: reference,
      name: writtenName(source, userType),
      nullable: kid(reference, 'NULLABLE_TYPE') !== undefined,
      args: [],
    },
    projections: kids(kid(userType, 'TYPE_ARGUMENT_LIST'), 'TYPE_PROJECTION'),
  };
}

export function typeOf(source, reference) {
  const root = shellOf(source, reference);
  const pending = root === undefined ? [] : [root];
  for (const { type, projections } of pending) {
    const argumentShells = projections.map((projection) =>
      shellOf(source, kid(projection, 'TYPE_REFERENCE')),
    );
    type.args = argumentShells.map((argument) => argument?.type);
    pending.push(...argumentShells.filter((argument) => argument !== undefined));
  }
  return root?.type;
}
