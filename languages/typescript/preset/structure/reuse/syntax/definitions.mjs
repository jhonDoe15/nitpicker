import ts from 'typescript';
import { declarationParts, fileBindings, freeBindings } from './bindings.mjs';
import { leafTexts, normalizedTexts } from './tokens.mjs';

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
const TRANSPARENT = [
  ts.isAsExpression,
  ts.isSatisfiesExpression,
  ts.isParenthesizedExpression,
  ts.isTypeAssertionExpression,
];
const NAMED_DECLARATIONS = [
  ['class', ts.isClassDeclaration],
  ['interface', ts.isInterfaceDeclaration],
  ['enum', ts.isEnumDeclaration],
];

function isFunctionNode(node) {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function hasModifier(node, kind) {
  const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
  return modifiers.some((modifier) => modifier.kind === kind);
}

function isExported(node) {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

function isDefaultExport(node) {
  return hasModifier(node, ts.SyntaxKind.DefaultKeyword);
}

function isSimplePropertyName(name) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name);
}

function literalChildren(node) {
  if (LITERAL_KINDS.has(node.kind)) return [];
  if (ts.isPrefixUnaryExpression(node)) return [node.operand];
  if (ts.isArrayLiteralExpression(node)) return [...node.elements];
  if (ts.isObjectLiteralExpression(node)) return [...node.properties];
  if (ts.isPropertyAssignment(node) && isSimplePropertyName(node.name)) return [node.initializer];
  const transparent = TRANSPARENT.some((matches) => matches(node));
  return transparent ? [node.expression] : undefined;
}

function isLiteralOnly(expression) {
  const pending = [expression];
  for (const node of pending) {
    const children = literalChildren(node);
    if (children === undefined) return false;
    pending.push(...children);
  }
  return true;
}

function isComponentInitializer(expression) {
  const pending = [expression];
  for (const node of pending) {
    if (isFunctionNode(node)) return true;
    const callee = ts.isCallExpression(node) ? node.expression : undefined;
    const name =
      callee !== undefined && ts.isPropertyAccessExpression(callee) ? callee.name : callee;
    if (name !== undefined && ts.isIdentifier(name) && WRAPPERS.has(name.text)) {
      pending.push(...node.arguments.slice(0, 1));
    }
  }
  return false;
}

function functionTag(node, form) {
  const isAsync = ts.getModifiers(node)?.some(({ kind }) => kind === ts.SyntaxKind.AsyncKeyword);
  return `${form}${isAsync === true ? ':async' : ''}${node.asteriskToken === undefined ? '' : ':gen'}`;
}

function definitionOf(spec, sourceFile, lookup) {
  const nodes = [
    ...(spec.overloads ?? []).flatMap(declarationParts),
    ...(spec.annotation === undefined ? [] : [spec.annotation]),
    ...declarationParts(spec.node),
  ];
  const texts = leafTexts(nodes, sourceFile);
  const tokens = normalizedTexts(texts);
  const first = sourceFile.getLineAndCharacterOfPosition(spec.statement.getStart(sourceFile)).line;
  const last = sourceFile.getLineAndCharacterOfPosition(spec.statement.getEnd()).line;
  return {
    name: spec.name,
    kind: spec.kind,
    text: `${spec.tag}|${tokens.join(' ')}`,
    tokens,
    free: freeBindings(nodes, lookup),
    size: texts.length,
    exported: spec.exported,
    isDefault: spec.isDefault,
    literal: spec.literal ?? false,
    component: spec.component ?? false,
    line: first + 1,
    lines: last - first + 1,
    span: [spec.statement.getStart(sourceFile), spec.statement.getEnd()],
  };
}

function constSpec(declaration, statement) {
  const initializer = declaration.initializer;
  const base = {
    name: declaration.name.getText(),
    statement,
    exported: isExported(statement),
    isDefault: false,
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

function variableSpecs(statement) {
  const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
  return statement.declarationList.declarations
    .filter(
      ({ name, initializer }) => isConst && ts.isIdentifier(name) && initializer !== undefined,
    )
    .map((declaration) => constSpec(declaration, statement));
}

function overloadsOf(statement, sourceFile) {
  return sourceFile.statements.filter(
    (other) =>
      ts.isFunctionDeclaration(other) &&
      other.body === undefined &&
      other.name?.text === statement.name.text,
  );
}

function declarationSpecs(statement, sourceFile) {
  const base = {
    name: statement.name?.text,
    statement,
    exported: isExported(statement),
    isDefault: isDefaultExport(statement),
    node: statement,
  };
  if (base.name === undefined) return [];
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

export function fileDefinitions(sourceFile) {
  const lookup = fileBindings(sourceFile);
  return sourceFile.statements
    .flatMap((statement) =>
      ts.isVariableStatement(statement)
        ? variableSpecs(statement)
        : declarationSpecs(statement, sourceFile),
    )
    .map((spec) => definitionOf(spec, sourceFile, lookup));
}
