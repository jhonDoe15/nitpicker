import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { typeServices } from '../security/security-values.mjs';

export function hasArrayType(context, node, withTuples = true) {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(node));
  const members = type.isUnion() ? type.types : [type];
  return members.every(
    (member) => checker.isArrayType(member) || (withTuples && checker.isTupleType(member)),
  );
}

const COLLECTION_NAME = /^(?:Readonly|Weak)?(?:Map|Set)$|Array$/u;

export function hasCollectionType(context, node) {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(node));
  const members = type.isUnion() ? type.types : [type];
  return members.some(
    (member) =>
      (member.flags & ts.TypeFlags.Any) !== 0 ||
      checker.isArrayType(member) ||
      checker.isTupleType(member) ||
      COLLECTION_NAME.test(member.getSymbol()?.name ?? ''),
  );
}
