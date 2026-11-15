import path from 'node:path';
import type TypeScript from 'typescript';
import { memoized } from '../memo.mts';
import { readLayout } from '../../typed/policy-views.mts';
import { ts } from '../../typed/typescript-views.mts';

export type TsFunction = (
  | TypeScript.FunctionDeclaration
  | TypeScript.MethodDeclaration
  | TypeScript.FunctionExpression
  | TypeScript.ArrowFunction
  | TypeScript.GetAccessorDeclaration
) & { readonly body: TypeScript.ConciseBody };
type Implementation =
  TypeScript.ObjectLiteralExpression | TypeScript.ClassDeclaration | TypeScript.ClassExpression;
type ImplementedType = readonly [TypeScript.Node, Implementation];
type ImplementationIndex = Map<TypeScript.Symbol | undefined, Implementation[]>;
export type ImplementationState = {
  readonly program: TypeScript.Program;
  readonly checker: TypeScript.TypeChecker;
};

const indexes = new WeakMap<TypeScript.Program, ImplementationIndex>();
const layout = readLayout();
const TEST_PATH =
  /(?:^|\/)(?:test|tests|__tests__|__mocks__|test-support|e2e|fixtures|__fixtures__)\/|\.(?:test|spec)\.[^/]+$/u;

function unwrappedExpression(node: TypeScript.Node): TypeScript.Node {
  const chain = [node];
  for (const current of chain) {
    if (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1) ?? node;
}

function isFunctionWithBody(node: TypeScript.Node | undefined): node is TsFunction {
  return (
    node !== undefined &&
    (ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isGetAccessorDeclaration(node)) &&
    node.body !== undefined
  );
}

export function functionLike(declaration: TypeScript.Node): TsFunction | undefined {
  if (isFunctionWithBody(declaration)) {
    return declaration;
  }
  const holdsValue =
    ts.isVariableDeclaration(declaration) ||
    ts.isPropertyDeclaration(declaration) ||
    ts.isPropertyAssignment(declaration);
  const value =
    holdsValue && declaration.initializer !== undefined
      ? unwrappedExpression(declaration.initializer)
      : undefined;
  return isFunctionWithBody(value) ? value : undefined;
}

function aliased(
  checker: TypeScript.TypeChecker,
  symbol: TypeScript.Symbol | undefined,
): TypeScript.Symbol | undefined {
  return symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

export function resolvedSymbol(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): TypeScript.Symbol | undefined {
  return aliased(checker, checker.getSymbolAtLocation(node));
}

export function calleeDeclaration(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): TypeScript.Declaration | undefined {
  const symbol = resolvedSymbol(checker, node);
  const shorthand = symbol?.declarations?.find(ts.isShorthandPropertyAssignment);
  const target =
    shorthand === undefined
      ? symbol
      : aliased(checker, checker.getShorthandAssignmentValueSymbol(shorthand));
  const declarations = target?.declarations ?? [];
  return (
    declarations.find((declaration) => functionLike(declaration) !== undefined) ?? declarations[0]
  );
}

function isBodiless(declaration: TypeScript.Node): boolean {
  return (
    ts.isMethodSignature(declaration) ||
    ts.isPropertySignature(declaration) ||
    (ts.isMethodDeclaration(declaration) && declaration.body === undefined) ||
    (ts.isPropertyDeclaration(declaration) && declaration.initializer === undefined)
  );
}

function ownerName(container: TypeScript.Node | undefined): TypeScript.Identifier | undefined {
  if (container === undefined) {
    return undefined;
  }
  if (ts.isInterfaceDeclaration(container) || ts.isClassDeclaration(container)) {
    return container.name;
  }
  return ts.isTypeLiteralNode(container) && ts.isTypeAliasDeclaration(container.parent)
    ? container.parent.name
    : undefined;
}

function isTsNode(value: unknown): value is TypeScript.Node {
  return typeof value === 'object' && value !== null && 'kind' in value && 'pos' in value;
}

function returnedObjects(fn: TypeScript.SignatureDeclaration): ImplementedType[] {
  const body: unknown = Reflect.get(fn, 'body');
  const { type } = fn;
  if (!isTsNode(body) || type === undefined || !ts.isTypeReferenceNode(type)) {
    return [];
  }
  const returned = ts.isBlock(body)
    ? body.statements.filter(ts.isReturnStatement).map(({ expression }) => expression)
    : [body];
  return returned
    .filter((expression) => expression !== undefined)
    .map(unwrappedExpression)
    .filter(ts.isObjectLiteralExpression)
    .map((object): ImplementedType => [type.typeName, object]);
}

function implementedTypes(node: TypeScript.Node): ImplementedType[] {
  if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.heritageClauses) {
    return node.heritageClauses.flatMap(({ types }) =>
      types.map(({ expression }): ImplementedType => [expression, node]),
    );
  }
  if (ts.isVariableDeclaration(node) && node.type && ts.isTypeReferenceNode(node.type)) {
    const value = node.initializer && unwrappedExpression(node.initializer);
    return value && ts.isObjectLiteralExpression(value) ? [[node.type.typeName, value]] : [];
  }
  return ts.isFunctionLike(node) ? returnedObjects(node) : [];
}

function isTestSource(program: TypeScript.Program, fileName: string): boolean {
  const relative = path.relative(program.getCurrentDirectory(), fileName).replaceAll('\\', '/');
  return TEST_PATH.test(relative) || layout.isTestFile(relative);
}

function projectFiles(program: TypeScript.Program): TypeScript.SourceFile[] {
  return program
    .getSourceFiles()
    .filter(
      (file) =>
        !(
          file.isDeclarationFile ||
          program.isSourceFileFromExternalLibrary(file) ||
          file.fileName.includes('/node_modules/') ||
          isTestSource(program, file.fileName)
        ),
    );
}

function implementationIndex({ program, checker }: ImplementationState): ImplementationIndex {
  const index: ImplementationIndex = new Map();
  const pending: TypeScript.Node[] = projectFiles(program);
  for (const node of pending) {
    for (const [typeName, implementation] of implementedTypes(node)) {
      const symbol = resolvedSymbol(checker, typeName);
      index.set(symbol, [...(index.get(symbol) ?? []), implementation]);
    }
    ts.forEachChild(node, (child) => {
      pending.push(child);
    });
  }
  return index;
}

function memberNamed(
  implementation: Implementation,
  name: string,
): TypeScript.NamedDeclaration | undefined {
  const members: readonly TypeScript.NamedDeclaration[] = ts.isObjectLiteralExpression(
    implementation,
  )
    ? implementation.properties
    : implementation.members;
  return members.find(
    (member) =>
      member.name !== undefined && ts.isIdentifier(member.name) && member.name.text === name,
  );
}

function inheritedFunction(
  checker: TypeScript.TypeChecker,
  implementation: Implementation,
  name: string,
): TsFunction | undefined {
  const property = checker.getPropertyOfType(checker.getTypeAtLocation(implementation), name);
  const declaration = property?.declarations?.find((each) => functionLike(each) !== undefined);
  return declaration === undefined ? undefined : functionLike(declaration);
}

function memberFunction(
  checker: TypeScript.TypeChecker,
  implementation: Implementation,
  name: string,
): TsFunction | undefined {
  const member = memberNamed(implementation, name);
  if (member === undefined) {
    return ts.isObjectLiteralExpression(implementation)
      ? undefined
      : inheritedFunction(checker, implementation, name);
  }
  if (ts.isShorthandPropertyAssignment(member)) {
    const declaration = checker.getShorthandAssignmentValueSymbol(member)?.valueDeclaration;
    return declaration === undefined ? undefined : functionLike(declaration);
  }
  return functionLike(member);
}

export function implementationsOf(
  state: ImplementationState,
  declaration: TypeScript.NamedDeclaration,
): TsFunction[] {
  if (ts.isSourceFile(declaration)) {
    return [];
  }
  const name = ownerName(declaration.parent);
  const member =
    declaration.name !== undefined && ts.isIdentifier(declaration.name)
      ? declaration.name.text
      : '';
  if (name === undefined || member === '' || !isBodiless(declaration)) {
    return [];
  }
  const implementations = memoized(indexes, state.program, () => implementationIndex(state));
  const owner = resolvedSymbol(state.checker, name);
  return (implementations.get(owner) ?? [])
    .map((implementation) => memberFunction(state.checker, implementation, member))
    .filter((fn) => fn !== undefined);
}
