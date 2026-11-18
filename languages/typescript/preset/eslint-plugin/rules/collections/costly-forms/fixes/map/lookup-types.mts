import type TypeScript from 'typescript';
import { typeServices, type Context } from '../../../../security/security-values.mts';
import { hasArrayType } from '../../../../support/checked-types.mts';
import { arrayItemTypes, isNeverFalsyObject } from '../../../../support/array-items.mts';
import { ts } from '../../../../typed/typescript-views.mts';
import { isStringLike } from '../element-types.mts';
import type { LookupShape } from './lookup-shape.mts';

type Services = NonNullable<ReturnType<typeof typeServices>>;

const NULLISH = ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void;
const PLAIN_PROPERTY = new Set<TypeScript.SyntaxKind>([
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.PropertyAssignment,
  ts.SyntaxKind.ShorthandPropertyAssignment,
]);

function isNullable(type: TypeScript.Type): boolean {
  const members = type.isUnion() ? type.types : [type];
  return members.some((member) => (member.flags & NULLISH) !== 0);
}

function hasPlainStringKey(
  services: Services,
  item: TypeScript.Type,
  { key, keyNode }: LookupShape,
): boolean {
  const checker = services.program.getTypeChecker();
  const symbol = checker.getPropertyOfType(item, key);
  const declaration = symbol?.valueDeclaration;
  if (symbol === undefined || declaration === undefined || !PLAIN_PROPERTY.has(declaration.kind)) {
    return false;
  }
  const type = checker.getTypeOfSymbolAtLocation(
    symbol,
    services.esTreeNodeToTSNodeMap.get(keyNode),
  );
  return isStringLike(type);
}

export function checkedItem(context: Context, shape: LookupShape): TypeScript.Type | undefined {
  const services = typeServices(context);
  const { receiver, value } = shape;
  if (services === undefined || hasArrayType(context, receiver, false) !== 'yes') {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const [item, ...others] = arrayItemTypes(context, receiver)?.items ?? [];
  const holds =
    item !== undefined &&
    others.length === 0 &&
    !item.isUnion() &&
    !isNullable(services.getTypeAtLocation(receiver)) &&
    isNeverFalsyObject(checker, item) &&
    hasPlainStringKey(services, item, shape) &&
    isStringLike(services.getTypeAtLocation(value));
  return holds ? item : undefined;
}
