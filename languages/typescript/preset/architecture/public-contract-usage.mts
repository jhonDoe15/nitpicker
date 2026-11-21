import type TypeScript from 'typescript';
import { typescriptApi } from '../../adapters/typed/typescript-program.mts';
import { type UnusedMethod, engineUnusedMethods } from './typed/contract-engine.mts';
import { depthFirst, syntaxChildren } from './typed/syntax-views.mts';
import { accessedSymbol, type SymbolLookup } from './contract-usage/accessed-symbol.mts';
import { readFileSync, realpathSync } from 'node:fs';
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

type Roots = { readonly sourceRoot: string; readonly ownRoot: string };

type Context = Roots & { readonly checker: TypeScript.TypeChecker };

const IMPLEMENTING_CLASS = /\bimplements\b/u;
const TEST_PATH = /(?:^|\/)(?:__tests__|tests|fixtures)\/|\.(?:test|spec)\.[cm]?tsx?$/u;

type ClassCursor = {
  readonly node: TypeScript.Node;
  readonly containingClass: TypeScript.Node | undefined;
};

function isProductionFile(fileName: string, root: string): boolean {
  const relative = path.relative(root, fileName).split(path.sep).join('/');
  return (
    relative !== '..' &&
    !relative.startsWith('../') &&
    !path.isAbsolute(relative) &&
    !TEST_PATH.test(relative)
  );
}

function isProductionSource(source: TypeScript.SourceFile, root: string): boolean {
  return !source.isDeclarationFile && isProductionFile(source.fileName, root);
}

function declaresImplementingClass(fileName: string): boolean {
  const text = ts.sys.readFile(fileName) ?? readFileSync(fileName, 'utf8');
  return IMPLEMENTING_CLASS.test(text);
}

export function hasImplementingClass(fileNames: readonly string[], ownRoot: string): boolean {
  return fileNames
    .filter((fileName) => !fileName.endsWith('.d.ts') && isProductionFile(fileName, ownRoot))
    .some(declaresImplementingClass);
}

function isExported(declaration: TypeScript.InterfaceDeclaration): boolean {
  return (
    declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
    false
  );
}

function interfaceDeclaration(
  symbol: TypeScript.Symbol | undefined,
): TypeScript.InterfaceDeclaration | undefined {
  return symbol?.declarations?.find(ts.isInterfaceDeclaration);
}

function implementedContracts(
  statement: TypeScript.ClassDeclaration,
  { checker, ownRoot }: Context,
): ContractEntry[] {
  const types = (statement.heritageClauses ?? [])
    .filter((clause) => clause.token === ts.SyntaxKind.ImplementsKeyword)
    .flatMap((clause) => [...clause.types])
    .map((heritage) => checker.getTypeAtLocation(heritage));
  return types.flatMap((type) => {
    const declaration = interfaceDeclaration(type.symbol);
    return declaration &&
      isExported(declaration) &&
      isProductionSource(declaration.getSourceFile(), ownRoot)
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

function methodNames(
  contracts: ReadonlyMap<TypeScript.InterfaceDeclaration, Contract>,
): Set<string> {
  return new Set([...contracts.values()].flatMap((contract) => [...contract.keys()]));
}

function recordUses(
  sources: readonly TypeScript.SourceFile[],
  lookup: SymbolLookup,
  index: ReadonlyMap<TypeScript.Declaration, ReadonlySet<Method>>,
): void {
  for (const source of sources) {
    for (const { node, containingClass } of depthFirst<ClassCursor>(
      { node: source, containingClass: undefined },
      classChildren,
    )) {
      const currentClass = ts.isClassDeclaration(node) ? node : containingClass;
      recordSymbolUse(accessedSymbol(node, lookup), currentClass, index);
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
  { sourceRoot, ownRoot = sourceRoot }: Pick<Roots, 'sourceRoot'> & Partial<Roots>,
): UnusedMethod[] {
  const checker = program.getTypeChecker();
  const sources = program
    .getSourceFiles()
    .filter((source) => isProductionSource(source, sourceRoot));
  const own = sources.filter((source) => isProductionSource(source, ownRoot));
  const contracts = collectContracts(own, { checker, sourceRoot, ownRoot });
  if (contracts.size === 0) {
    return [];
  }
  const lookup = { checker, names: methodNames(contracts) };
  recordUses(sources, lookup, indexMethodDeclarations(contracts));
  return unusedMethods(contracts, sourceRoot).sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function parsedConfig(absoluteConfig: string): TypeScript.ParsedCommandLine {
  const config = ts.readConfigFile(absoluteConfig, (fileName) => ts.sys.readFile(fileName));
  if (config.error) {
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(absoluteConfig));
  if (parsed.errors.length > 0) {
    throw new Error(
      parsed.errors
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
        .join('\n'),
    );
  }
  return parsed;
}

function nodeUnusedMethods(
  parsed: TypeScript.ParsedCommandLine,
  roots: Roots,
): { readonly sourceRoot: string; readonly findings: UnusedMethod[] } {
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  return {
    sourceRoot: roots.sourceRoot,
    findings: findUnusedPublicContractMethods(program, roots),
  };
}

export function analyzePublicContractUsage(
  configPath: string,
  {
    displayRoot,
    environment = process.env,
  }: { readonly displayRoot?: string; readonly environment?: NodeJS.ProcessEnv } = {},
): UnusedMethod[] {
  const absoluteConfig = path.resolve(configPath);
  const parsed = parsedConfig(absoluteConfig);
  const configRoot = parsed.options.rootDir ?? path.dirname(absoluteConfig);
  const ownRoot = displayRoot === undefined ? configRoot : path.resolve(displayRoot);
  if (!hasImplementingClass(parsed.fileNames, ownRoot)) {
    return [];
  }
  const wholeProject = ownRoot === configRoot;
  const { sourceRoot, findings } =
    (wholeProject ? engineUnusedMethods(absoluteConfig, environment) : undefined) ??
    nodeUnusedMethods(parsed, { sourceRoot: configRoot, ownRoot });
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
