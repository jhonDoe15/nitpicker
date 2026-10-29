import { ts } from '../../typescript-api/typescript-api.mjs';
import { KINDS } from './kinds.mjs';

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

export function kindOfType(typeNode, sourceFile) {
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

const TYPE_NAME_KINDS = new Map([
  ['Array', 'array'],
  ['Set', 'set'],
  ['Map', 'map'],
  ['Date', 'date'],
  ['RegExp', 'regexp'],
  ['RegExpExecArray', 'execArray'],
  ['RegExpMatchArray', 'execArray'],
]);

export function kindOfTypeName(name) {
  return TYPE_NAME_KINDS.get(name);
}

const MAX_ALIAS_DEPTH = 4;

export function mutablePart(typeNode, sourceFile) {
  const pending = [{ node: typeNode, trail: [], depth: 0, notReadonly: false }];
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

function isMutableType(node, sourceFile) {
  if (ts.isArrayTypeNode(node)) {
    return true;
  }
  if (!ts.isTypeReferenceNode(node)) {
    return false;
  }
  const name = node.typeName.getText(sourceFile);
  return MUTABLE_CLASSES.has(name) || kindOfTypeName(name) !== undefined;
}

function childrenOf(node, item, sourceFile) {
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

function elementOf(typeNode) {
  return ts.isArrayTypeNode(typeNode) ? typeNode.elementType : typeNode;
}

function childrenOfReference(node, item, sourceFile) {
  const name = node.typeName.getText(sourceFile);
  const deeper = { trail: item.trail, depth: item.depth + 1, notReadonly: false };
  if (READONLY_WRAPPERS.has(name)) {
    return (node.typeArguments ?? [])
      .filter((argument) => argument.getText(sourceFile) !== 'Date')
      .map((argument) => ({ ...deeper, node: argument }));
  }
  const declaration = sourceFile.statements.find(
    (statement) =>
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

function membersAsItems(members, item, sourceFile) {
  return members
    .filter((member) => ts.isPropertySignature(member) && member.type !== undefined)
    .map((member) => ({
      node: member.type,
      trail: [...item.trail, member.name.getText(sourceFile)],
      depth: item.depth,
      notReadonly: !member.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
      ),
    }));
}
