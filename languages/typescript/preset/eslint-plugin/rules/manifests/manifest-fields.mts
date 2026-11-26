import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';
import { unwrapped } from '../typed/syntax-views.mts';

const LIST_METHODS = [
  'includes',
  'indexOf',
  'map',
  'filter',
  'forEach',
  'some',
  'every',
  'find',
  'reduce',
  'flatMap',
  'join',
  'push',
  'length',
];
const STRICT_LIST_METHODS = LIST_METHODS.filter(
  (name) => name !== 'includes' && name !== 'indexOf',
);

export const SINGLE_SHAPE_MEMBERS = new Map<string, ReadonlySet<string>>([
  ['bundleDependencies', new Set(LIST_METHODS)],
  ['bundledDependencies', new Set(LIST_METHODS)],
  ['workspaces', new Set([...LIST_METHODS, 'packages'])],
  ['man', new Set(STRICT_LIST_METHODS.filter((name) => name !== 'length'))],
]);

const MANIFEST_NAME =
  /^(?:manifest|pkg|pkgJson|packageJson|packageJsonContent)$|(?:Manifest|PackageJson)$/u;
const MANIFEST_TYPE = /^(?:PackageJson|PackageManifest|NormalizedPackageJson)$/u;

export function fieldNameOf(member: TSESTree.MemberExpression): string | undefined {
  if (!member.computed) {
    return nameOf(member.property);
  }
  return member.property.type === AST_NODE_TYPES.Literal &&
    typeof member.property.value === 'string'
    ? member.property.value
    : undefined;
}

export function isManifestType(node: TSESTree.TypeNode | undefined): boolean {
  return (
    node?.type === AST_NODE_TYPES.TSTypeReference &&
    node.typeName.type === AST_NODE_TYPES.Identifier &&
    MANIFEST_TYPE.test(node.typeName.name)
  );
}

export function isManifestName(node: TSESTree.Node): boolean {
  const name =
    node.type === AST_NODE_TYPES.MemberExpression && !node.computed
      ? nameOf(node.property)
      : nameOf(node);
  return name !== undefined && MANIFEST_NAME.test(name);
}

export function leavesOf(node: TSESTree.Node): TSESTree.Node[] {
  const plain = unwrapped(node);
  if (plain.type === AST_NODE_TYPES.ChainExpression) {
    return leavesOf(plain.expression);
  }
  if (
    plain.type === AST_NODE_TYPES.LogicalExpression &&
    (plain.operator === '||' || plain.operator === '??')
  ) {
    return [...leavesOf(plain.left), ...leavesOf(plain.right)];
  }
  return [plain];
}

export function isEmptyList(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.ArrayExpression && node.elements.length === 0;
}
