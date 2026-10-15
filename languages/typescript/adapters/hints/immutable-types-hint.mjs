import { KINDS } from '../immutable-types/kinds.mjs';
import ts from 'typescript';
import { mutablePart, kindOfType } from '../immutable-types/types.mjs';
import { kindOfExpression } from '../immutable-types/expressions.mjs';

const GENERIC_HINT = 'Type it deeply readonly, e.g. `readonly T[]` or `{ readonly field: T }`.';

export function immutableTypesMessage({ kind, node, sourceFile }) {
  const declaration = node === undefined ? undefined : declarationOf(kind, node);
  const name = declaration === undefined ? undefined : declarationName(kind, declaration);
  const finding = declaration === undefined ? undefined : flaggedPart(declaration, sourceFile);
  const subject = subjectOf(kind, name);
  return `${subject} is mutable${detailOf(finding)}; domain/ values must be deeply readonly. ${hintOf(finding)}`;
}

function subjectOf(kind, name) {
  if (name === undefined) {
    return kind;
  }
  return `${kind}${kind === 'Return type' ? ' of' : ''} \`${name}\``;
}

function detailOf(finding) {
  if (finding?.member !== undefined) {
    return finding.notReadonly
      ? ` (\`${finding.member}\` is not readonly)`
      : ` (\`${finding.member}: ${finding.typeText}\`)`;
  }
  return finding?.kind === undefined ? '' : ` (${finding.label})`;
}

function hintOf(finding) {
  if (finding?.kind === undefined) {
    return GENERIC_HINT;
  }
  return finding.kind === 'class'
    ? `${finding.label} is a class and always mutable: keep it in adapters/ and pass domain code a plain value.`
    : KINDS[finding.kind].hint;
}

function declarationOf(kind, node) {
  const candidates = [node, node.parent, node.parent?.parent].filter((candidate) => candidate);
  return candidates.find(DECLARATION_MATCHERS[kind]);
}

const DECLARATION_MATCHERS = {
  Variable: (node) => ts.isVariableDeclaration(node) || ts.isBindingElement(node),
  Parameter: (node) => ts.isParameter(node),
  'Return type': (node) => ts.isFunctionLike(node),
  Property: (node) => ts.isPropertyDeclaration(node) || ts.isPropertySignature(node),
};

function declarationName(kind, declaration) {
  const nameNode = kind === 'Return type' ? functionNameNode(declaration) : declaration.name;
  return nameNode !== undefined && ts.isIdentifier(nameNode) ? nameNode.text : undefined;
}

function functionNameNode(declaration) {
  if (declaration.name !== undefined) {
    return declaration.name;
  }
  const { parent } = declaration;
  return parent !== undefined && ts.isVariableDeclaration(parent) ? parent.name : undefined;
}

function hasInitializedType(node) {
  return ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isPropertyDeclaration(node);
}

function flaggedPart(declaration, sourceFile) {
  const typeNode = declaration.type;
  if (typeNode !== undefined) {
    return describeTypePart(mutablePart(typeNode, sourceFile), sourceFile);
  }
  if (!hasInitializedType(declaration) || declaration.initializer === undefined) {
    return undefined;
  }
  const kind = kindOfExpression(declaration.initializer);
  return kind === undefined ? undefined : { kind, label: KINDS[kind].label };
}

function describeTypePart(part, sourceFile) {
  if (part === undefined) {
    return undefined;
  }
  const typeText = part.typeNode.getText(sourceFile);
  const classified = kindOfType(part.typeNode, sourceFile);
  return {
    ...classified,
    typeText,
    ...(part.trail.length === 0
      ? {}
      : { member: part.trail.join('.'), notReadonly: part.notReadonly === true }),
  };
}
