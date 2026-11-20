import type TypeScript from 'typescript';
import { typescriptApi } from '../../../../adapters/typed/typescript-program.mts';
import { EXPRESSIONS } from './expressions.mts';
import { MARKUP } from './markup.mts';
import { depthFirst, syntaxChildren } from '../../typed/analysis-views.mts';
import { boundNames, importedNames, nameNode } from './names.mts';
import { STATEMENTS } from './statements.mts';
import { NONE, at, isStatementNode, opaque, textOf } from './tree-nodes.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';
import type {
  Converted,
  ConverterTable,
  LambdaSource,
  NearDuplicateUnit,
  SharedContext,
  TreeContext,
  TreeNode,
  UnitContext,
  UnitFact,
  UnitRoot,
} from './typed/tree-types.mts';
import { uniqueNames, withSnippet } from './typed/unit-views.mts';

type Labelled = { readonly node: TypeScript.Node; readonly label: string };

const ts = typescriptApi();
const CONVERTERS: ConverterTable = { ...STATEMENTS, ...EXPRESSIONS, ...MARKUP };

const UNIT_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.FunctionExpression,
]);

const ACCESSOR_PREFIX: Readonly<Partial<Record<TypeScript.SyntaxKind, string>>> = {
  [ts.SyntaxKind.GetAccessor]: 'get ',
  [ts.SyntaxKind.SetAccessor]: 'set ',
};

function joined(parent: string, part: string): string {
  return parent === '' ? part : `${parent}.${part}`;
}

function keyText(name: TypeScript.PropertyName, sourceFile: TypeScript.SourceFile): string {
  return ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteralLike(name)
    ? name.text
    : name.getText(sourceFile);
}

function callLabel(node: TypeScript.CallExpression, sourceFile: TypeScript.SourceFile): string {
  const [first] = node.arguments;
  const argument =
    first !== undefined && ts.isStringLiteralLike(first) ? JSON.stringify(first.text) : '';
  const callee = node.expression.getText(sourceFile).replaceAll(/\s+/gu, '');
  return `${/^[\w$.#]+$/u.test(callee) ? callee : 'call'}(${argument})`;
}

function labelOf(node: TypeScript.Node, parent: string, sourceFile: TypeScript.SourceFile): string {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
    return node.name?.text ?? 'default';
  }
  if (ts.isVariableDeclaration(node)) {
    return node.name.getText(sourceFile);
  }
  if (ts.isConstructorDeclaration(node)) {
    return joined(parent, 'constructor');
  }
  if (ts.isCallExpression(node)) {
    return joined(parent, callLabel(node, sourceFile));
  }
  if (
    ts.isPropertyAssignment(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    return joined(parent, `${ACCESSOR_PREFIX[node.kind] ?? ''}${keyText(node.name, sourceFile)}`);
  }
  return parent;
}

function isUnitNode(node: TypeScript.Node): node is LambdaSource {
  return UNIT_KINDS.has(node.kind) && 'body' in node && node.body !== undefined;
}

function unitRoots(sourceFile: TypeScript.SourceFile): UnitRoot[] {
  const pending: Labelled[] = [{ node: sourceFile, label: '' }];
  const roots: UnitRoot[] = [];
  for (const { node, label } of pending) {
    const own = labelOf(node, label, sourceFile);
    if (isUnitNode(node)) {
      roots.push({ node, label: own === '' ? '<anonymous>' : own });
    } else {
      appendAll(
        pending,
        syntaxChildren(node).map((child) => ({ node: child, label: own })),
      );
    }
  }
  return roots.toSorted((left, right) => left.node.pos - right.node.pos);
}

function convertedTree(root: TypeScript.Node, context: UnitContext): TreeContext {
  const converted = new Map<TypeScript.Node, Converted>();
  const full: TreeContext = {
    ...context,
    get: (source) =>
      converted.get(source) ??
      opaque(isStatementNode(source) ? 'statement' : 'expression', source, context),
    lambda: (source) => lambdaNode(source, full),
  };
  for (const source of [...depthFirst(root, syntaxChildren)].toReversed()) {
    const convert = CONVERTERS[source.kind];
    if (convert !== undefined) {
      converted.set(source, withSnippet(convert(source, full), textOf(source, context)));
    }
  }
  return full;
}

function lambdaParts(source: LambdaSource, context: TreeContext): Converted[] {
  const parameters = at(
    'parameters',
    source,
    source.parameters.map((parameter) => context.get(parameter)),
  );
  const { body } = source;
  if (body === undefined) {
    return [parameters];
  }
  const converted = ts.isBlock(body)
    ? context.get(body)
    : at('block', body, [at('return', body, [context.get(body)])]);
  return [parameters, converted];
}

function modifiersOf(source: LambdaSource): string {
  const isAsync = (ts.getModifiers(source) ?? []).some(
    ({ kind }) => kind === ts.SyntaxKind.AsyncKeyword,
  );
  return `${isAsync ? 'async' : ''}${source.asteriskToken === undefined ? '' : '*'}`;
}

function withModifiers(source: LambdaSource): { readonly value?: string } {
  const modifiers = modifiersOf(source);
  return modifiers === '' ? {} : { value: modifiers };
}

function lambdaNode(source: LambdaSource, context: TreeContext): TreeNode {
  return at({ kind: 'lambda', ...withModifiers(source) }, source, lambdaParts(source, context));
}

function unitContext(root: TypeScript.Node, shared: SharedContext): UnitContext {
  const names = { bound: boundNames(root), imported: shared.imported };
  return {
    ...shared,
    name: (text, source) => ({ ...at('name', source), ...nameNode(text, names) }),
    typeOf: (type) =>
      type === undefined ? NONE : at({ kind: 'type', value: textOf(type, shared) }, type),
  };
}

function isConstant(declaration: TypeScript.Node): boolean {
  return (
    ts.isVariableDeclaration(declaration) &&
    (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) !== 0
  );
}

function isFinal(node: LambdaSource): boolean {
  if (ts.isFunctionDeclaration(node)) {
    return true;
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return isConstant(node.parent);
  }
  const isPrivate = (ts.getModifiers(node) ?? []).some(
    ({ kind }) => kind === ts.SyntaxKind.PrivateKeyword,
  );
  return ts.isMethodDeclaration(node) && (isPrivate || ts.isPrivateIdentifier(node.name));
}

function unitOf({ node, label }: UnitRoot, shared: SharedContext): NearDuplicateUnit {
  const context = convertedTree(node, unitContext(node, shared));
  const parts = [context.typeOf(node.type), ...lambdaParts(node, context)];
  const tree = at({ kind: 'function', ...withModifiers(node) }, node, parts);
  const tokens = tokenCount(node, shared.sourceFile);
  return { name: label, start: tree.start, end: tree.end, tokens, final: isFinal(node), tree };
}

const TOKEN = /[\w$]+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\S/gu;

function tokenCount(node: TypeScript.Node, sourceFile: TypeScript.SourceFile): number {
  return node.getText(sourceFile).match(TOKEN)?.length ?? 0;
}

export function nearDuplicateUnits(
  sourceFile: TypeScript.SourceFile,
  file: string,
  {
    moduleOf = (specifier) => specifier,
  }: { readonly moduleOf?: (specifier: string) => string } = {},
): UnitFact[] {
  if (sourceFile.isDeclarationFile) {
    return [];
  }
  const shared = { sourceFile, imported: importedNames(sourceFile, moduleOf) };
  return uniqueNames(unitRoots(sourceFile).map((root) => unitOf(root, shared))).map((unit) => ({
    id: `${file}#${unit.name}`,
    file,
    ...unit,
  }));
}

export function nearDuplicateUnitNodes(sourceFile: TypeScript.SourceFile): TypeScript.Node[] {
  return sourceFile.isDeclarationFile ? [] : unitRoots(sourceFile).map(({ node }) => node);
}
