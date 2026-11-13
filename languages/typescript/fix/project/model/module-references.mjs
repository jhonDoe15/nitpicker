import { ts } from '../../../typescript-api/typescript-api.mjs';

function literalText(node) {
  return node !== undefined &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
}

function leftmost(node) {
  const chain = [node];
  for (const current of chain) {
    const isSum =
      current !== undefined &&
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.PlusToken;
    if (isSum) {
      chain.push(current.left);
    }
  }
  return chain.at(-1);
}

function staticPrefix(node) {
  const start = leftmost(node);
  if (start !== undefined && ts.isTemplateExpression(start)) {
    return start.head.text;
  }
  return literalText(start) ?? '';
}

function declarationReference(node) {
  const specifier = node.moduleSpecifier;
  if (specifier === undefined || !ts.isStringLiteral(specifier)) {
    return undefined;
  }
  const kind = ts.isImportDeclaration(node) ? 'import' : 'export';
  return { kind, node, specifier: specifier.text, literal: specifier };
}

function callReference(node) {
  const [argument] = node.arguments;
  const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
  const isDynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
  if (isRequire === isDynamic) {
    return undefined;
  }
  return {
    kind: isDynamic ? 'dynamic' : 'require',
    node,
    specifier: literalText(argument),
    literal: literalText(argument) === undefined ? undefined : argument,
    prefix: staticPrefix(argument),
  };
}

function importTypeReference(node) {
  const literal = ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined;
  return literal !== undefined && ts.isStringLiteral(literal)
    ? { kind: 'type-import', node, specifier: literal.text, literal }
    : undefined;
}

export function moduleReferences(sourceFile) {
  const found = [];
  function visit(node) {
    const reference =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? declarationReference(node)
        : undefined;
    const call = ts.isCallExpression(node) ? callReference(node) : undefined;
    const type = ts.isImportTypeNode(node) ? importTypeReference(node) : undefined;
    found.push(...[reference, call, type].filter((entry) => entry !== undefined));
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}
