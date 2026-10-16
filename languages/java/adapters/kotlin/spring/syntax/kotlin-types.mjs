import { kid, kids, textOf } from './kotlin-tree.mjs';

function userTypeOf(reference) {
  return kid(kid(reference, 'NULLABLE_TYPE') ?? reference, 'USER_TYPE');
}

function writtenName(source, userType) {
  const qualifier = kid(userType, 'USER_TYPE');
  const own = textOf(source, kid(userType, 'REFERENCE_EXPRESSION'));
  return qualifier === undefined ? own : `${writtenName(source, qualifier)}.${own}`;
}

export function typeOf(source, reference) {
  const userType = reference === undefined ? undefined : userTypeOf(reference);
  if (userType === undefined) {
    return undefined;
  }
  const projections = kids(kid(userType, 'TYPE_ARGUMENT_LIST'), 'TYPE_PROJECTION');
  return {
    node: reference,
    name: writtenName(source, userType),
    nullable: kid(reference, 'NULLABLE_TYPE') !== undefined,
    args: projections.map((projection) => typeOf(source, kid(projection, 'TYPE_REFERENCE'))),
  };
}
