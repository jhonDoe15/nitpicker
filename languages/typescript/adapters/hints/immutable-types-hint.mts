import type TypeScript from 'typescript';
import { ERROR_CLASS_HINT, KINDS } from '../immutable-types/kinds.mts';
import { parentOf, typescriptApi } from '../typed/typescript-program.mts';
import {
  type MutablePart,
  type TypeKind,
  mutablePart,
  kindOfType,
} from '../immutable-types/types.mts';
import {
  type Declaration,
  typeParameterFinding,
  untypedFinding,
} from '../immutable-types/untyped.mts';

type Node = TypeScript.Node;

type MemberDetail = { readonly member: string; readonly notReadonly: boolean };

type FlaggedPart = TypeKind & { readonly typeText?: string } & (
    MemberDetail | { readonly member?: undefined }
  );

type DeclarationMatcher = (node: Node) => node is Declaration;

const ts = typescriptApi();

const GENERIC_HINT = 'Type it deeply readonly, e.g. `readonly T[]` or `{ readonly field: T }`.';

export function immutableTypesParts({
  kind,
  node,
  sourceFile,
}: {
  readonly kind: string;
  readonly node: Node | undefined;
  readonly sourceFile: TypeScript.SourceFile;
}): { readonly message: string; readonly allowedForm: string } {
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

function subjectOf(kind: string, name: string | undefined): string {
  if (name === undefined) {
    return kind;
  }
  return `${kind}${kind === 'Return type' ? ' of' : ''} \`${name}\``;
}

function detailOf(finding: FlaggedPart | undefined): string {
  if (finding?.member !== undefined) {
    return finding.notReadonly
      ? ` (\`${finding.member}\` is not readonly)`
      : ` (\`${finding.member}: ${String(finding.typeText)}\`)`;
  }
  return finding?.kind === undefined ? '' : ` (${String(finding.label)})`;
}

function hintOf(finding: FlaggedPart | undefined): string {
  if (finding?.kind === undefined) {
    return GENERIC_HINT;
  }
  if (finding.kind !== 'class') {
    return KINDS[finding.kind].hint;
  }
  return finding.label === 'Error'
    ? ERROR_CLASS_HINT
    : `${String(finding.label)} is a class and always mutable: keep it in adapters/ and pass domain code a plain value.`;
}

function declarationOf(kind: string, node: Node): Declaration | undefined {
  const parent = parentOf(node);
  const candidates = [node, parent, parent === undefined ? undefined : parentOf(parent)].filter(
    (candidate) => candidate !== undefined,
  );
  const matcher = DECLARATION_MATCHERS[kind];
  return matcher === undefined ? undefined : candidates.find(matcher);
}

const DECLARATION_MATCHERS: Readonly<Partial<Record<string, DeclarationMatcher>>> = {
  Variable: (node) => ts.isVariableDeclaration(node) || ts.isBindingElement(node),
  Parameter: (node) => ts.isParameter(node),
  'Return type': (node) => ts.isFunctionLike(node),
  Property: (node) => ts.isPropertyDeclaration(node) || ts.isPropertySignature(node),
};

function declarationName(kind: string, declaration: Declaration): string | undefined {
  const nameNode = kind === 'Return type' ? functionNameNode(declaration) : declaration.name;
  return nameNode !== undefined && ts.isIdentifier(nameNode) ? nameNode.text : undefined;
}

function functionNameNode(declaration: Declaration): TypeScript.Node | undefined {
  if (declaration.name !== undefined) {
    return declaration.name;
  }
  const parent = parentOf(declaration);
  return parent !== undefined && ts.isVariableDeclaration(parent) ? parent.name : undefined;
}

function flaggedPart(
  declaration: Declaration,
  sourceFile: TypeScript.SourceFile,
): FlaggedPart | undefined {
  const typeNode = 'type' in declaration ? declaration.type : undefined;
  if (typeNode === undefined) {
    return untypedFinding(declaration);
  }
  return (
    describeTypePart(mutablePart(typeNode, sourceFile), sourceFile) ??
    typeParameterFinding(declaration, sourceFile)
  );
}

function describeTypePart(
  part: MutablePart | undefined,
  sourceFile: TypeScript.SourceFile,
): FlaggedPart | undefined {
  if (part === undefined) {
    return undefined;
  }
  const typeText = part.typeNode.getText(sourceFile);
  const classified = kindOfType(part.typeNode, sourceFile);
  const described = { ...classified, typeText };
  return part.trail.length === 0
    ? described
    : { ...described, member: part.trail.join('.'), notReadonly: part.notReadonly };
}
