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

export function findUnusedPublicContractMethods(program, { sourceRoot }) {
  const checker = program.getTypeChecker();
  const sources = program
    .getSourceFiles()
    .filter((source) => isProductionSource(source, sourceRoot));
  const contracts = new Map();
  for (const source of sources) {
    for (const statement of source.statements) {
      if (!ts.isClassDeclaration(statement)) continue;
      for (const clause of statement.heritageClauses ?? []) {
        if (clause.token !== ts.SyntaxKind.ImplementsKeyword) continue;
        for (const heritage of clause.types) {
          const contractType = checker.getTypeAtLocation(heritage);
          const declaration = contractType.symbol?.declarations?.find(ts.isInterfaceDeclaration);
          if (
            !declaration ||
            !isExported(declaration) ||
            !isProductionSource(declaration.getSourceFile(), sourceRoot)
          )
            continue;
          if (!contracts.has(declaration)) {
            const methods = new Map();
            for (const member of contractType.getProperties()) {
              if (
                checker.getTypeOfSymbolAtLocation(member, declaration).getCallSignatures()
                  .length === 0
              )
                continue;
              methods.set(member.name, {
                declarations: new Set(member.declarations),
                implementations: new Set(),
                used: false,
              });
            }
            contracts.set(declaration, methods);
          }
          const implementationType = checker.getTypeAtLocation(statement);
          for (const [name, method] of contracts.get(declaration)) {
            method.implementations.add(statement);
            for (const memberDeclaration of implementationType.getProperty(name)?.declarations ??
              []) {
              method.declarations.add(memberDeclaration);
            }
          }
        }
      }
    }
  }

  const methodsByDeclaration = new Map();
  for (const methods of contracts.values()) {
    for (const method of methods.values()) {
      for (const declaration of method.declarations) {
        const consumers = methodsByDeclaration.get(declaration) ?? new Set();
        consumers.add(method);
        methodsByDeclaration.set(declaration, consumers);
      }
    }
  }
  for (const source of sources) {
    function visit(node, containingClass) {
      const currentClass = ts.isClassDeclaration(node) ? node : containingClass;
      const symbol = accessedSymbol(checker, node);
      for (const declaration of symbol?.declarations ?? []) {
        for (const method of methodsByDeclaration.get(declaration) ?? []) {
          if (!method.implementations.has(currentClass)) method.used = true;
        }
      }
      ts.forEachChild(node, (child) => {
        visit(child, currentClass);
      });
    }
    visit(source, undefined);
  }
  const findings = [];
  for (const [contract, methods] of contracts) {
    for (const [method, usage] of methods) {
      if (!usage.used)
        findings.push({
          file: path.relative(sourceRoot, contract.getSourceFile().fileName),
          contract: contract.name.text,
          method,
        });
    }
  }
  return findings.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
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
