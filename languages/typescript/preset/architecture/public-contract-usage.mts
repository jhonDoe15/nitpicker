import type TypeScript from 'typescript';
import { typescriptApi } from '../../adapters/typed/typescript-program.mts';
import { depthFirst, syntaxChildren } from './typed/syntax-views.mts';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ts = typescriptApi();

type Method = {
  readonly declarations: Set<TypeScript.Declaration>;
  readonly implementations: Set<TypeScript.Node | undefined>;
  used: boolean;
};

type Contract = Map<string, Method>;

type ContractEntry = {
  readonly type: TypeScript.Type;
  readonly declaration: TypeScript.InterfaceDeclaration;
};

type Context = { readonly checker: TypeScript.TypeChecker; readonly sourceRoot: string };

type ClassCursor = {
  readonly node: TypeScript.Node;
  readonly containingClass: TypeScript.Node | undefined;
};

type UnusedMethod = { readonly file: string; readonly contract: string; readonly method: string };

function isProductionSource(source: TypeScript.SourceFile, sourceRoot: string): boolean {
  const relative = path.relative(sourceRoot, source.fileName);
  return (
    !source.isDeclarationFile &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !/(?:^|\/)(?:__tests__|tests|fixtures)\/|\.(?:test|spec)\.[cm]?tsx?$/.test(relative)
  );
}

function isExported(declaration: TypeScript.InterfaceDeclaration): boolean {
  return (
    declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
    false
  );
}

function accessedSymbol(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): TypeScript.Symbol | undefined {
  let symbol: TypeScript.Symbol | undefined;
  if (ts.isPropertyAccessExpression(node)) symbol = checker.getSymbolAtLocation(node.name);
  if (ts.isElementAccessExpression(node))
    symbol = checker.getSymbolAtLocation(node.argumentExpression);
  if (
    ts.isBindingElement(node) &&
    ts.isObjectBindingPattern(node.parent) &&
    ts.isVariableDeclaration(node.parent.parent) &&
    node.parent.parent.initializer
  ) {
    const name = node.propertyName ?? node.name;
    if (ts.isIdentifier(name))
      symbol = checker.getTypeAtLocation(node.parent.parent.initializer).getProperty(name.text);
  }
  return symbol;
}

function interfaceDeclaration(
  symbol: TypeScript.Symbol | undefined,
): TypeScript.InterfaceDeclaration | undefined {
  return symbol?.declarations?.find(ts.isInterfaceDeclaration);
}

function implementedContracts(
  statement: TypeScript.ClassDeclaration,
  { checker, sourceRoot }: Context,
): ContractEntry[] {
  const types = (statement.heritageClauses ?? [])
    .filter((clause) => clause.token === ts.SyntaxKind.ImplementsKeyword)
    .flatMap((clause) => [...clause.types])
    .map((heritage) => checker.getTypeAtLocation(heritage));
  return types.flatMap((type) => {
    const declaration = interfaceDeclaration(type.symbol);
    return declaration &&
      isExported(declaration) &&
      isProductionSource(declaration.getSourceFile(), sourceRoot)
      ? [{ type, declaration }]
      : [];
  });
}

function contractMethods(type: TypeScript.Type, checker: TypeScript.TypeChecker): Contract {
  const declaration = type.symbol.declarations?.find(ts.isInterfaceDeclaration);
  if (declaration === undefined) {
    return new Map();
  }
  return new Map(
    type
      .getProperties()
      .filter(
        (member) =>
          checker.getTypeOfSymbolAtLocation(member, declaration).getCallSignatures().length > 0,
      )
      .map((member) => [
        member.name,
        { declarations: new Set(member.declarations), implementations: new Set(), used: false },
      ]),
  );
}

function registerImplementation(
  statement: TypeScript.ClassDeclaration,
  contract: ContractEntry,
  {
    contracts,
    checker,
  }: {
    readonly contracts: Map<TypeScript.InterfaceDeclaration, Contract>;
    readonly checker: TypeScript.TypeChecker;
  },
): void {
  const methods = contracts.get(contract.declaration) ?? contractMethods(contract.type, checker);
  contracts.set(contract.declaration, methods);
  const implementation = checker.getTypeAtLocation(statement);
  for (const [name, method] of methods) {
    method.implementations.add(statement);
    for (const declaration of implementation.getProperty(name)?.declarations ?? [])
      method.declarations.add(declaration);
  }
}

function collectContracts(
  sources: readonly TypeScript.SourceFile[],
  context: Context,
): Map<TypeScript.InterfaceDeclaration, Contract> {
  const contracts = new Map<TypeScript.InterfaceDeclaration, Contract>();
  const statements = sources
    .flatMap((source) => [...source.statements])
    .filter(ts.isClassDeclaration);
  for (const statement of statements) {
    for (const contract of implementedContracts(statement, context)) {
      registerImplementation(statement, contract, { contracts, checker: context.checker });
    }
  }
  return contracts;
}

function indexMethodDeclarations(
  contracts: ReadonlyMap<TypeScript.InterfaceDeclaration, Contract>,
): Map<TypeScript.Declaration, Set<Method>> {
  const index = new Map<TypeScript.Declaration, Set<Method>>();
  const methods = [...contracts.values()].flatMap((contract) => [...contract.values()]);
  for (const method of methods) {
    for (const declaration of method.declarations) {
      const consumers = index.get(declaration) ?? new Set<Method>();
      consumers.add(method);
      index.set(declaration, consumers);
    }
  }
  return index;
}

function recordSymbolUse(
  symbol: TypeScript.Symbol | undefined,
  currentClass: TypeScript.Node | undefined,
  index: ReadonlyMap<TypeScript.Declaration, ReadonlySet<Method>>,
): void {
  const methods = (symbol?.declarations ?? []).flatMap((declaration) => [
    ...(index.get(declaration) ?? []),
  ]);
  for (const method of methods.filter((candidate) => !candidate.implementations.has(currentClass)))
    method.used = true;
}

function classChildren({ node, containingClass }: ClassCursor): ClassCursor[] {
  const currentClass = ts.isClassDeclaration(node) ? node : containingClass;
  return syntaxChildren(node).map((child) => ({ node: child, containingClass: currentClass }));
}

function recordUses(
  sources: readonly TypeScript.SourceFile[],
  checker: TypeScript.TypeChecker,
  index: ReadonlyMap<TypeScript.Declaration, ReadonlySet<Method>>,
): void {
  for (const source of sources) {
    for (const { node, containingClass } of depthFirst<ClassCursor>(
      { node: source, containingClass: undefined },
      classChildren,
    )) {
      const currentClass = ts.isClassDeclaration(node) ? node : containingClass;
      recordSymbolUse(accessedSymbol(checker, node), currentClass, index);
    }
  }
}

function unusedMethods(
  contracts: ReadonlyMap<TypeScript.InterfaceDeclaration, Contract>,
  sourceRoot: string,
): UnusedMethod[] {
  return [...contracts].flatMap(([contract, methods]) =>
    [...methods]
      .filter(([, usage]) => !usage.used)
      .map(([method]) => ({
        file: path.relative(sourceRoot, contract.getSourceFile().fileName),
        contract: contract.name.text,
        method,
      })),
  );
}

export function findUnusedPublicContractMethods(
  program: TypeScript.Program,
  { sourceRoot }: { readonly sourceRoot: string },
): UnusedMethod[] {
  const checker = program.getTypeChecker();
  const sources = program
    .getSourceFiles()
    .filter((source) => isProductionSource(source, sourceRoot));
  const contracts = collectContracts(sources, { checker, sourceRoot });
  if (contracts.size === 0) {
    return [];
  }
  recordUses(sources, checker, indexMethodDeclarations(contracts));
  return unusedMethods(contracts, sourceRoot).sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

export function analyzePublicContractUsage(
  configPath: string,
  { displayRoot }: { readonly displayRoot?: string } = {},
): UnusedMethod[] {
  const absoluteConfig = path.resolve(configPath);
  const config = ts.readConfigFile(absoluteConfig, (fileName) => ts.sys.readFile(fileName));
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(absoluteConfig));
  if (parsed.errors.length > 0)
    throw new Error(
      parsed.errors
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
        .join('\n'),
    );
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const sourceRoot = parsed.options.rootDir ?? path.dirname(absoluteConfig);
  const findings = findUnusedPublicContractMethods(program, { sourceRoot });
  if (displayRoot === undefined) {
    return findings;
  }
  return findings.map((item) => ({
    ...item,
    file: path.relative(displayRoot, path.resolve(sourceRoot, item.file)).replaceAll('\\', '/'),
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: public-contract-usage.mjs <tsconfig.json>');
  process.stdout.write(
    `${JSON.stringify({ findings: analyzePublicContractUsage(process.argv[2]) }, null, 2)}\n`,
  );
}
