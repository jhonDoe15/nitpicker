import { depthFirst } from '../../../../shared/traversal.mjs';
import { syntaxChildren } from '../syntax/children.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function isProductionSource(source, sourceRoot) {
  const relative = path.relative(sourceRoot, source.fileName);
  return (
    !source.isDeclarationFile &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !/(?:^|\/)(?:__tests__|tests|fixtures)\/|\.(?:test|spec)\.[cm]?tsx?$/.test(relative)
  );
}

function isExported(declaration) {
  return declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function accessedSymbol(checker, node) {
  let symbol;
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

function implementedContracts(statement, { checker, sourceRoot }) {
  const types = (statement.heritageClauses ?? [])
    .filter((clause) => clause.token === ts.SyntaxKind.ImplementsKeyword)
    .flatMap((clause) => [...clause.types])
    .map((heritage) => checker.getTypeAtLocation(heritage));
  return types
    .map((type) => ({
      type,
      declaration: type.symbol?.declarations?.find(ts.isInterfaceDeclaration),
    }))
    .filter(
      ({ declaration }) =>
        declaration &&
        isExported(declaration) &&
        isProductionSource(declaration.getSourceFile(), sourceRoot),
    );
}

function contractMethods(type, checker) {
  const declaration = type.symbol.declarations.find(ts.isInterfaceDeclaration);
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

function registerImplementation(statement, contract, { contracts, checker }) {
  const methods = contracts.get(contract.declaration) ?? contractMethods(contract.type, checker);
  contracts.set(contract.declaration, methods);
  const implementation = checker.getTypeAtLocation(statement);
  for (const [name, method] of methods) {
    method.implementations.add(statement);
    for (const declaration of implementation.getProperty(name)?.declarations ?? [])
      method.declarations.add(declaration);
  }
}

function collectContracts(sources, context) {
  const contracts = new Map();
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

function indexMethodDeclarations(contracts) {
  const index = new Map();
  const methods = [...contracts.values()].flatMap((contract) => [...contract.values()]);
  for (const method of methods) {
    for (const declaration of method.declarations) {
      const consumers = index.get(declaration) ?? new Set();
      consumers.add(method);
      index.set(declaration, consumers);
    }
  }
  return index;
}

function recordSymbolUse(symbol, currentClass, index) {
  const methods = (symbol?.declarations ?? []).flatMap((declaration) => [
    ...(index.get(declaration) ?? []),
  ]);
  for (const method of methods.filter((candidate) => !candidate.implementations.has(currentClass)))
    method.used = true;
}

function classChildren({ node, containingClass }) {
  const currentClass = ts.isClassDeclaration(node) ? node : containingClass;
  return syntaxChildren(node).map((child) => ({ node: child, containingClass: currentClass }));
}

function recordUses(sources, checker, index) {
  for (const source of sources) {
    for (const { node, containingClass } of depthFirst(
      { node: source, containingClass: undefined },
      classChildren,
    )) {
      const currentClass = ts.isClassDeclaration(node) ? node : containingClass;
      recordSymbolUse(accessedSymbol(checker, node), currentClass, index);
    }
  }
}

function unusedMethods(contracts, sourceRoot) {
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

export function findUnusedPublicContractMethods(program, { sourceRoot }) {
  const checker = program.getTypeChecker();
  const sources = program
    .getSourceFiles()
    .filter((source) => isProductionSource(source, sourceRoot));
  const contracts = collectContracts(sources, { checker, sourceRoot });
  recordUses(sources, checker, indexMethodDeclarations(contracts));
  return unusedMethods(contracts, sourceRoot).sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

export function analyzePublicContractUsage(configPath) {
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
  return findUnusedPublicContractMethods(program, {
    sourceRoot: parsed.options.rootDir ?? path.dirname(absoluteConfig),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: public-contract-usage.mjs <tsconfig.json>');
  process.stdout.write(
    `${JSON.stringify({ findings: analyzePublicContractUsage(process.argv[2]) }, null, 2)}\n`,
  );
}
