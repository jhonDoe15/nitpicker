import ts, { type Type, type TypeChecker, type UnionType } from 'typescript';

declare const checker: TypeChecker;
declare const type: Type;
declare const union: UnionType;
declare const config: { types: string[] };

export function firstMember(): Type | undefined {
  return union.types[0];
}

export function arrayMember(): Type | undefined {
  return union.types.find((member) => checker.isArrayType(member));
}

export function nullMember(): Type | undefined {
  return union.types.find((member) => (member.flags & ts.TypeFlags.Null) === 0);
}

export function firstOfFiltered(): Type | undefined {
  return union.types.filter((member) => checker.isArrayType(member))[0];
}

export function firstAfterNarrowing(): Type | undefined {
  return type.isUnion() ? type.types[0] : undefined;
}

export function propertyTable(): Map<string, unknown> {
  return new Map(union.types.flatMap((member) => type.getProperties().map((symbol) => [symbol.name, member] as const)));
}

export function printedUnion(): boolean {
  return checker.typeToString(type) === 'string | undefined';
}

export function single(): Type | undefined {
  if (union.types.length === 1) return union.types[0];
  return undefined;
}

export function present(): boolean {
  return union.types.find((member) => checker.isArrayType(member)) !== undefined;
}

export function unique(): Type | undefined {
  return union.types.find((member) => member === type);
}

export function plainList(): string | undefined {
  return config.types[0];
}

export function spacedGuard(one: UnionType): Type | undefined {
  // one.types.length===1
  return one.types[0];
}

export function letterGuard(two: UnionType): Type | undefined {
  // two.types.length === 1ª
  return two.types[0];
}
