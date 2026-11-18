import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import type { Project } from '../typed/project-types.mts';
import type { ImporterReference, ModuleReference } from './reference-types.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';

const ts = typescriptApi();

function literalText(node: TypeScript.Node | undefined): string | undefined {
  return node !== undefined &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
}

function leftmost(node: TypeScript.Node | undefined): TypeScript.Node | undefined {
  const chain: (TypeScript.Node | undefined)[] = [node];
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

function staticPrefix(node: TypeScript.Node | undefined): string {
  const start = leftmost(node);
  if (start !== undefined && ts.isTemplateExpression(start)) {
    return start.head.text;
  }
  return literalText(start) ?? '';
}

function declarationReference(
  node: TypeScript.ImportDeclaration | TypeScript.ExportDeclaration,
): ModuleReference | undefined {
  const specifier = node.moduleSpecifier;
  if (specifier === undefined || !ts.isStringLiteral(specifier)) {
    return undefined;
  }
  const kind = ts.isImportDeclaration(node) ? 'import' : 'export';
  return { kind, node, specifier: specifier.text, literal: specifier };
}

function callReference(node: TypeScript.CallExpression): ModuleReference | undefined {
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

function importTypeReference(node: TypeScript.ImportTypeNode): ModuleReference | undefined {
  const literal = ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined;
  return literal !== undefined && ts.isStringLiteral(literal)
    ? { kind: 'type-import', node, specifier: literal.text, literal }
    : undefined;
}

export function referencesTo(project: Project, target: string): ImporterReference[] {
  return project.names
    .filter((importer) => importer !== target)
    .flatMap((importer) =>
      moduleReferences(project.sourceFile(importer))
        .filter(({ specifier }) => project.resolve(specifier ?? '', importer) === target)
        .map((reference) => ({ ...reference, importer })),
    );
}

export function moduleReferences(sourceFile: TypeScript.SourceFile | undefined): ModuleReference[] {
  const found: ModuleReference[] = [];
  function visit(node: TypeScript.Node | undefined): void {
    if (node === undefined) {
      return;
    }
    const reference =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? declarationReference(node)
        : undefined;
    const call = ts.isCallExpression(node) ? callReference(node) : undefined;
    const type = ts.isImportTypeNode(node) ? importTypeReference(node) : undefined;
    appendAll(
      found,
      [reference, call, type].filter((entry) => entry !== undefined),
    );
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}
