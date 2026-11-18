import type { ParserServicesWithTypeInformation, TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeServices, type Context } from '../security/security-values.mts';

export type Types = {
  readonly services: ParserServicesWithTypeInformation;
  readonly checker: TypeScript.TypeChecker;
};
export type Relation = { readonly many: boolean; readonly target: TypeScript.Type | undefined };
export type JoinSite = {
  readonly orm: 'typeorm' | 'sequelize' | 'mikroOrm';
  readonly node: TSESTree.Node;
  readonly joined: ReadonlyMap<string, boolean>;
};
type JoinOwner = { readonly key: string; readonly type: TypeScript.Type | undefined };

const COLLECTIONS = new Set(['Collection', 'LoadedCollection']);
const WRAPPERS = new Set(['Ref', 'Reference', 'IdentifiedReference', 'LoadedReference', 'Promise']);
const MAX_UNWRAP = 4;

export function relationTypes(context: Context): Types | undefined {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  return { services, checker: services.program.getTypeChecker() };
}

function typeOf(types: Types, node: TSESTree.Node): TypeScript.Type {
  return types.services.getTypeAtLocation(node);
}

function isReference(type: TypeScript.Type): type is TypeScript.TypeReference {
  return 'target' in type && type.target !== undefined;
}

function typeArguments(types: Types, type: TypeScript.Type): readonly TypeScript.Type[] {
  return isReference(type) ? types.checker.getTypeArguments(type) : [];
}

function nameOf(type: TypeScript.Type): string | undefined {
  return type.aliasSymbol?.getName() ?? type.getSymbol()?.getName();
}

function parts(type: TypeScript.Type): readonly TypeScript.Type[] {
  return type.isIntersection() || type.isUnion() ? type.types : [type];
}

function firstArgument(types: Types, type: TypeScript.Type): TypeScript.Type | undefined {
  return type.aliasTypeArguments?.[0] ?? typeArguments(types, type)[0];
}

function partRelation(types: Types, part: TypeScript.Type): Relation | undefined {
  if (types.checker.isArrayType(part)) {
    return { many: true, target: typeArguments(types, part)[0] };
  }
  const name = nameOf(part);
  if (name !== undefined && COLLECTIONS.has(name)) {
    return { many: true, target: firstArgument(types, part) };
  }
  return undefined;
}

function unwrappedPart(types: Types, part: TypeScript.Type): TypeScript.Type | undefined {
  const name = nameOf(part);
  return name !== undefined && WRAPPERS.has(name) ? firstArgument(types, part) : undefined;
}

function relationOf(types: Types, type: TypeScript.Type): Relation | undefined {
  const pending = [types.checker.getNonNullableType(type)];
  for (const plain of pending) {
    const found = parts(plain)
      .map((part) => partRelation(types, part))
      .find((relation) => relation !== undefined);
    if (found !== undefined) {
      return found;
    }
    const inner = parts(plain)
      .map((part) => unwrappedPart(types, part))
      .find((unwrapped) => unwrapped !== undefined);
    if (inner === undefined || pending.length > MAX_UNWRAP) {
      return { many: false, target: parts(plain)[0] };
    }
    pending.push(types.checker.getNonNullableType(inner));
  }
  return undefined;
}

function isTypeNode(value: unknown): value is TypeScript.TypeNode {
  return typeof value === 'object' && value !== null && 'kind' in value;
}

function typeAnnotationOf(declaration: TypeScript.Declaration): TypeScript.TypeNode | undefined {
  const annotation: unknown = Reflect.get(declaration, 'type');
  return isTypeNode(annotation) ? annotation : undefined;
}

function declaredType(types: Types, symbol: TypeScript.Symbol): TypeScript.Type {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  const typeNode = declaration === undefined ? undefined : typeAnnotationOf(declaration);
  if (typeNode !== undefined) {
    return types.checker.getTypeFromTypeNode(typeNode);
  }
  return declaration === undefined
    ? types.checker.getTypeOfSymbol(symbol)
    : types.checker.getTypeAtLocation(declaration);
}

export function relationNamed(
  types: Types,
  owner: TypeScript.Type | undefined,
  name: string,
): Relation | undefined {
  const symbol = owner === undefined ? undefined : types.checker.getPropertyOfType(owner, name);
  return symbol === undefined ? undefined : relationOf(types, declaredType(types, symbol));
}

export function relationsTo(
  types: Types,
  owner: TypeScript.Type | undefined,
  target: TypeScript.Type | undefined,
): [string, Relation][] {
  const wanted = target?.getSymbol();
  if (owner === undefined || wanted === undefined) {
    return [];
  }
  return types.checker.getPropertiesOfType(owner).flatMap((symbol): [string, Relation][] => {
    const relation = relationOf(types, declaredType(types, symbol));
    return relation?.target?.getSymbol() === wanted ? [[symbol.getName(), relation]] : [];
  });
}

export function typeArgumentOf(types: Types, node: TSESTree.Node): TypeScript.Type | undefined {
  return typeArguments(types, types.checker.getNonNullableType(typeOf(types, node)))[0];
}

export function instanceOf(types: Types, node: TSESTree.Node): TypeScript.Type | undefined {
  const [signature] = typeOf(types, node).getConstructSignatures();
  return signature?.getReturnType();
}

function innerList(types: Types, plain: TypeScript.Type): TypeScript.Type | undefined {
  if (types.checker.isTupleType(plain)) {
    return typeArguments(types, plain)[0];
  }
  const rows = types.checker.getPropertyOfType(plain, 'rows');
  return rows === undefined ? undefined : types.checker.getTypeOfSymbol(rows);
}

function listElement(types: Types, type: TypeScript.Type): TypeScript.Type | undefined {
  const pending = [type];
  for (const current of pending) {
    const plain = types.checker.getNonNullableType(current);
    if (types.checker.isArrayType(plain)) {
      return typeArguments(types, plain)[0];
    }
    const inner = innerList(types, plain);
    if (inner === undefined || pending.length > MAX_UNWRAP) {
      return parts(plain)[0];
    }
    pending.push(inner);
  }
  return undefined;
}

export function resultEntity(types: Types, call: TSESTree.Node): TypeScript.Type | undefined {
  const type = typeOf(types, call);
  return listElement(types, types.checker.getAwaitedType(type) ?? type);
}

export function declaredInPackage(
  types: Types,
  call: TSESTree.CallExpression,
  packages: readonly string[],
): boolean {
  const node = types.services.esTreeNodeToTSNodeMap.get(call);
  const file = types.checker.getResolvedSignature(node)?.declaration?.getSourceFile().fileName;
  const normalized = file?.replaceAll('\\', '/') ?? '';
  return packages.some((name) => normalized.includes(`/node_modules/${name}/`));
}

export function joinPaths(
  types: Types,
  root: TypeScript.Type | undefined,
  paths: readonly (readonly string[])[],
): Map<string, boolean> {
  const joined = new Map<string, boolean>();
  for (const segments of paths) {
    segments.reduce<JoinOwner | undefined>(
      (owner, segment) => {
        const relation =
          owner === undefined ? undefined : relationNamed(types, owner.type, segment);
        if (owner === undefined || relation === undefined) {
          return undefined;
        }
        const key = owner.key === '' ? segment : `${owner.key}.${segment}`;
        joined.set(key, relation.many);
        return { key, type: relation.target };
      },
      { key: '', type: root },
    );
  }
  return joined;
}
