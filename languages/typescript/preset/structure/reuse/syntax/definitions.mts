import { ts } from '../../../../typescript-api/typescript-api.mts';
import { declarationParts, fileBindings, freeBindings } from './bindings.mts';
import { leafTexts, normalizedTexts } from './tokens.mts';
import { untypedParts } from './type-syntax.mts';
import { expandsFully as untypedExpandsFully } from '../../../../../../shared/traversal.mjs';
import type TypeScript from 'typescript';
import { appendAll } from '../../../../../../shared/lists/lists.mts';
import type { Definition, Lookup, NamedStatement, Spec } from '../typed/syntax-types.mts';

const expandsFully: <T>(root: T, children: (node: T) => readonly T[] | undefined) => boolean =
  untypedExpandsFully;

const WRAPPERS = new Set(['memo', 'forwardRef']);
const LITERAL_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
]);
const NAMED_DECLARATIONS: readonly (readonly [string, (node: TypeScript.Node) => boolean])[] = [
  ['class', ts.isClassDeclaration],
  ['interface', ts.isInterfaceDeclaration],
  ['enum', ts.isEnumDeclaration],
];

function isFunctionNode(
  node: TypeScript.Node,
): node is TypeScript.ArrowFunction | TypeScript.FunctionExpression {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function hasModifier(node: TypeScript.Node, kind: TypeScript.SyntaxKind): boolean {
  const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
  return modifiers.some((modifier) => modifier.kind === kind);
}

function isExported(node: TypeScript.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

function isDefaultExport(node: TypeScript.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.DefaultKeyword);
}

function isSimplePropertyName(name: TypeScript.Node): boolean {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name);
}

function literalChildren(node: TypeScript.Node): readonly TypeScript.Node[] | undefined {
  if (LITERAL_KINDS.has(node.kind)) return [];
  if (ts.isPrefixUnaryExpression(node)) return [node.operand];
  if (ts.isArrayLiteralExpression(node)) return [...node.elements];
  if (ts.isObjectLiteralExpression(node)) return [...node.properties];
  if (ts.isPropertyAssignment(node) && isSimplePropertyName(node.name)) return [node.initializer];
  if (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    return [node.expression];
  }
  return undefined;
}

function isLiteralOnly(expression: TypeScript.Node): boolean {
  return expandsFully(expression, literalChildren);
}

function isComponentInitializer(expression: TypeScript.Node): boolean {
  const pending = [expression];
  for (const node of pending) {
    if (isFunctionNode(node)) return true;
    const callee = ts.isCallExpression(node) ? node.expression : undefined;
    const name =
      callee !== undefined && ts.isPropertyAccessExpression(callee) ? callee.name : callee;
    if (
      ts.isCallExpression(node) &&
      name !== undefined &&
      ts.isIdentifier(name) &&
      WRAPPERS.has(name.text)
    ) {
      appendAll(pending, node.arguments.slice(0, 1));
    }
  }
  return false;
}

function functionTag(node: TypeScript.FunctionLikeDeclaration, form: string): string {
  const isAsync = ts.getModifiers(node)?.some(({ kind }) => kind === ts.SyntaxKind.AsyncKeyword);
  return `${form}${isAsync === true ? ':async' : ''}${node.asteriskToken === undefined ? '' : ':gen'}`;
}

function definitionOf(spec: Spec, sourceFile: TypeScript.SourceFile, lookup: Lookup): Definition {
  const nodes = [
    ...(spec.overloads ?? []).flatMap(declarationParts),
    ...(spec.annotation === undefined ? [] : [spec.annotation]),
    ...declarationParts(spec.node),
  ];
  const texts = leafTexts(nodes, sourceFile);
  const tokens = Object.freeze(normalizedTexts(texts));
  const untypedTexts = leafTexts(untypedParts(spec.node), sourceFile, { untyped: true });
  const untypedTokens = Object.freeze(normalizedTexts(untypedTexts));
  const first = sourceFile.getLineAndCharacterOfPosition(spec.statement.getStart(sourceFile)).line;
  const last = sourceFile.getLineAndCharacterOfPosition(spec.statement.getEnd()).line;
  return {
    name: spec.name,
    kind: spec.kind,
    text: `${spec.tag}|${tokens.join(' ')}`,
    tokens,
    untypedTokens,
    free: freeBindings(nodes, lookup),
    size: texts.length,
    exported: spec.exported,
    isDefault: spec.isDefault,
    literal: spec.literal,
    component: spec.component,
    line: first + 1,
    lines: last - first + 1,
    span: [spec.statement.getStart(sourceFile), spec.statement.getEnd()],
  };
}

function constSpec(
  declaration: TypeScript.VariableDeclaration,
  initializer: TypeScript.Expression,
  statement: TypeScript.Statement,
): Spec {
  const base = {
    name: declaration.name.getText(),
    statement,
    exported: isExported(statement),
    isDefault: false,
    literal: false,
    component: false,
  };
  if (isFunctionNode(initializer)) {
    const form = ts.isArrowFunction(initializer) ? 'arrow' : 'function';
    return {
      ...base,
      kind: 'function',
      tag: functionTag(initializer, form),
      node: initializer,
      annotation: declaration.type,
      component: true,
    };
  }
  return {
    ...base,
    kind: 'const',
    tag: 'const',
    node: declaration,
    literal: isLiteralOnly(initializer),
    component: isComponentInitializer(initializer),
  };
}

function variableSpecs(statement: TypeScript.VariableStatement): Spec[] {
  const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
  return statement.declarationList.declarations.flatMap((declaration) => {
    const { name, initializer } = declaration;
    return isConst && ts.isIdentifier(name) && initializer !== undefined
      ? [constSpec(declaration, initializer, statement)]
      : [];
  });
}

function overloadsOf(
  statement: TypeScript.FunctionDeclaration,
  sourceFile: TypeScript.SourceFile,
): TypeScript.FunctionDeclaration[] {
  return sourceFile.statements.flatMap((other) =>
    ts.isFunctionDeclaration(other) &&
    other.body === undefined &&
    other.name?.text === statement.name?.text
      ? [other]
      : [],
  );
}

function declarationSpecs(statement: NamedStatement, sourceFile: TypeScript.SourceFile): Spec[] {
  const name = statement.name?.text;
  if (name === undefined) return [];
  const base = {
    name,
    statement,
    exported: isExported(statement),
    isDefault: isDefaultExport(statement),
    node: statement,
    literal: false,
    component: false,
  };
  if (ts.isFunctionDeclaration(statement)) {
    const tag = functionTag(statement, 'function');
    const overloads = overloadsOf(statement, sourceFile);
    return statement.body === undefined
      ? []
      : [{ ...base, kind: 'function', tag, overloads, component: true }];
  }
  if (ts.isTypeAliasDeclaration(statement)) {
    return [{ ...base, kind: 'type', tag: 'type' }];
  }
  const [kind] = NAMED_DECLARATIONS.find(([, matches]) => matches(statement)) ?? [];
  return kind === undefined ? [] : [{ ...base, kind, tag: kind }];
}

export function fileDefinitions(sourceFile: TypeScript.SourceFile): Definition[] {
  const lookup = fileBindings(sourceFile);
  return sourceFile.statements
    .flatMap((statement) =>
      ts.isVariableStatement(statement)
        ? variableSpecs(statement)
        : declarationSpecs(statement, sourceFile),
    )
    .map((spec) => definitionOf(spec, sourceFile, lookup));
}
