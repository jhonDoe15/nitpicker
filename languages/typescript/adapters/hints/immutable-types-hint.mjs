import { ERROR_CLASS_HINT, KINDS } from '../immutable-types/kinds.mjs';
import { ts } from '../../typescript-api/typescript-api.mjs';
import { mutablePart, kindOfType } from '../immutable-types/types.mjs';
import { typeParameterFinding, untypedFinding } from '../immutable-types/untyped.mjs';

const GENERIC_HINT = 'Type it deeply readonly, e.g. `readonly T[]` or `{ readonly field: T }`.';

export function immutableTypesParts({ kind, node, sourceFile }) {
  const declaration = node === undefined ? undefined : declarationOf(kind, node);
  const name = declaration === undefined ? undefined : declarationName(kind, declaration);
  const finding = declaration === undefined ? undefined : flaggedPart(declaration, sourceFile);
  const subject = subjectOf(kind, name);
  const hint = hintOf(finding);
  return {
    message: `${subject} is mutable${detailOf(finding)}; domain/ values must be deeply readonly. ${hint}`,
    allowedForm: hint,
  };
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
  if (finding.kind !== 'class') {
    return KINDS[finding.kind].hint;
  }
  return finding.label === 'Error'
    ? ERROR_CLASS_HINT
    : `${finding.label} is a class and always mutable: keep it in adapters/ and pass domain code a plain value.`;
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

function flaggedPart(declaration, sourceFile) {
  const typeNode = declaration.type;
  if (typeNode === undefined) {
    return untypedFinding(declaration);
  }
  return (
    describeTypePart(mutablePart(typeNode, sourceFile), sourceFile) ??
    typeParameterFinding(declaration, sourceFile)
  );
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
