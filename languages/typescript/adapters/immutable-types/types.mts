import type TypeScript from 'typescript';
import { typescriptApi } from '../typed/typescript-program.mts';
import { type Kind, KINDS } from './kinds.mts';

type TypeNode = TypeScript.TypeNode;
type SourceFile = TypeScript.SourceFile;

export type TypeKind = { readonly kind?: Kind | 'class'; readonly label?: string };

type PendingType = {
  readonly node: TypeNode;
  readonly trail: readonly string[];
  readonly depth: number;
  readonly notReadonly: boolean;
};

export type MutablePart = {
  readonly trail: readonly string[];
  readonly typeNode: TypeNode;
  readonly notReadonly: boolean;
};

type ReadonlyMember = TypeScript.PropertySignature & { readonly type: TypeNode };

const ts = typescriptApi();

const READONLY_WRAPPERS = new Set(['Readonly', 'ReadonlyArray', 'ReadonlySet', 'ReadonlyMap']);

const MUTABLE_CLASSES = new Set([
  'AbortController',
  'AbortSignal',
  'ArrayBuffer',
  'Buffer',
  'Error',
  'EventTarget',
  'Headers',
  'URL',
  'URLSearchParams',
  'Uint8Array',
  'WeakMap',
  'WeakSet',
]);

export function kindOfType(typeNode: TypeNode, sourceFile: SourceFile): TypeKind {
  if (ts.isArrayTypeNode(typeNode)) {
    return { kind: 'array', label: KINDS.array.label };
  }
  if (!ts.isTypeReferenceNode(typeNode)) {
    return {};
  }
  const name = typeNode.typeName.getText(sourceFile);
  const kind = kindOfTypeName(name);
  if (kind !== undefined) {
    return { kind, label: KINDS[kind].label };
  }
  return MUTABLE_CLASSES.has(name) ? { kind: 'class', label: name } : {};
}

const TYPE_NAME_KINDS = new Map<string, Kind>([
  ['Array', 'array'],
  ['Set', 'set'],
  ['Map', 'map'],
  ['Date', 'date'],
  ['RegExp', 'regexp'],
  ['RegExpExecArray', 'execArray'],
  ['RegExpMatchArray', 'execArray'],
]);

export function kindOfTypeName(name: string): Kind | undefined {
  return TYPE_NAME_KINDS.get(name);
}

const MAX_ALIAS_DEPTH = 4;

export function mutablePart(typeNode: TypeNode, sourceFile: SourceFile): MutablePart | undefined {
  const pending: PendingType[] = [{ node: typeNode, trail: [], depth: 0, notReadonly: false }];
  for (const item of pending) {
    if (item.depth > MAX_ALIAS_DEPTH) {
      continue;
    }
    const node = ts.isParenthesizedTypeNode(item.node) ? item.node.type : item.node;
    if (item.notReadonly || isMutableType(node, sourceFile)) {
      return { trail: item.trail, typeNode: node, notReadonly: item.notReadonly };
    }
    pending.push(...childrenOf(node, item, sourceFile));
  }
  return undefined;
}

function isMutableType(node: TypeNode, sourceFile: SourceFile): boolean {
  if (ts.isArrayTypeNode(node)) {
    return true;
  }
  if (!ts.isTypeReferenceNode(node)) {
    return false;
  }
  const name = node.typeName.getText(sourceFile);
  return MUTABLE_CLASSES.has(name) || kindOfTypeName(name) !== undefined;
}

function childrenOf(node: TypeNode, item: PendingType, sourceFile: SourceFile): PendingType[] {
  const same = { trail: item.trail, depth: item.depth, notReadonly: false };
  if (ts.isTypeOperatorNode(node)) {
    const operand =
      node.operator === ts.SyntaxKind.ReadonlyKeyword ? elementOf(node.type) : node.type;
    return [{ ...same, node: operand }];
  }
  if (ts.isTypeReferenceNode(node)) {
    return childrenOfReference(node, item, sourceFile);
  }
  if (ts.isTypeLiteralNode(node)) {
    return membersAsItems(node.members, item, sourceFile);
  }
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    return node.types.map((member) => ({ ...same, node: member }));
  }
  return [];
}

function elementOf(typeNode: TypeNode): TypeNode {
  return ts.isArrayTypeNode(typeNode) ? typeNode.elementType : typeNode;
}

function childrenOfReference(
  node: TypeScript.TypeReferenceNode,
  item: PendingType,
  sourceFile: SourceFile,
): PendingType[] {
  const name = node.typeName.getText(sourceFile);
  const deeper = { trail: item.trail, depth: item.depth + 1, notReadonly: false };
  if (READONLY_WRAPPERS.has(name)) {
    return (node.typeArguments ?? [])
      .filter((argument) => argument.getText(sourceFile) !== 'Date')
      .map((argument) => ({ ...deeper, node: argument }));
  }
  const declaration = sourceFile.statements.find(
    (statement): statement is TypeScript.TypeAliasDeclaration | TypeScript.InterfaceDeclaration =>
      (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) &&
      statement.name.text === name,
  );
  if (declaration === undefined) {
    return [];
  }
  return ts.isTypeAliasDeclaration(declaration)
    ? [{ ...deeper, node: declaration.type }]
    : membersAsItems(declaration.members, { ...item, depth: item.depth + 1 }, sourceFile);
}

function membersAsItems(
  members: readonly TypeScript.TypeElement[],
  item: PendingType,
  sourceFile: SourceFile,
): PendingType[] {
  return members
    .filter(
      (member): member is ReadonlyMember =>
        ts.isPropertySignature(member) && member.type !== undefined,
    )
    .map((member) => ({
      node: member.type,
      trail: [...item.trail, member.name.getText(sourceFile)],
      depth: item.depth,
      notReadonly: !member.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
      ),
    }));
}
