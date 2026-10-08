import ts from 'typescript';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { callbackProtocolContracts } from './contracts.mjs';
import { defaultResolvedLayout } from '../layout.mjs';

function unwrap(node) {
  while (
    node &&
    (ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node))
  )
    node = node.expression;
  return node;
}

function memberName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isComputedPropertyName(node) && ts.isStringLiteral(node.expression))
    return node.expression.text;
  return undefined;
}

function functionLike(node) {
  return (
    node &&
    (ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node))
  );
}

function containingClass(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) return parent;
  }
  return undefined;
}

function declarationFor(identifier) {
  for (let scope = identifier.parent; scope; scope = scope.parent) {
    if (functionLike(scope)) {
      const parameter = scope.parameters.find((item) => memberName(item.name) === identifier.text);
      if (parameter) return parameter;
    }
    if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
      for (const statement of scope.statements) {
        if (ts.isVariableStatement(statement)) {
          const declaration = statement.declarationList.declarations.find(
            (item) => memberName(item.name) === identifier.text,
          );
          if (declaration) return declaration;
        }
        if (
          (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
          statement.name?.text === identifier.text
        )
          return statement;
        if (ts.isImportDeclaration(statement)) {
          const clause = statement.importClause;
          if (clause?.name?.text === identifier.text) return clause;
          if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
            const item = clause.namedBindings.elements.find(
              (element) => element.name.text === identifier.text,
            );
            if (item) return item;
          }
        }
      }
    }
  }
  return undefined;
}

function resolveValue(expression, bindings = new Map(), seen = new Set()) {
  const node = unwrap(expression);
  if (!node || seen.has(node)) return node;
  seen.add(node);
  if (ts.isIdentifier(node)) {
    const declaration = declarationFor(node);
    if (bindings.has(declaration)) return resolveValue(bindings.get(declaration), bindings, seen);
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer)
      return resolveValue(declaration.initializer, bindings, seen);
    if (declaration && functionLike(declaration)) return declaration;
  }
  if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword) {
    const member = containingClass(node)?.members.find(
      (item) => item.name && memberName(item.name) === node.name.text,
    );
    if (member && ts.isPropertyDeclaration(member) && member.initializer)
      return resolveValue(member.initializer, bindings, seen);
    if (member && functionLike(member)) return member;
  }
  return node;
}

function resolveCallback(expression, bindings) {
  const node = resolveValue(expression, bindings);
  if (functionLike(node)) return node;
  if (
    node &&
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'bind'
  ) {
    return resolveCallback(node.expression.expression, bindings);
  }
  return undefined;
}

function accessPath(expression, bindings, seen = new Set()) {
  const node = unwrap(expression);
  if (!node || seen.has(node)) return undefined;
  seen.add(node);
  if (node.kind === ts.SyntaxKind.ThisKeyword) return 'this';
  if (ts.isIdentifier(node)) {
    const declaration = declarationFor(node);
    const value =
      bindings.get(declaration) ??
      (declaration && ts.isVariableDeclaration(declaration) ? declaration.initializer : undefined);
    if (value && !ts.isNewExpression(unwrap(value))) return accessPath(value, bindings, seen);
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const receiver = accessPath(node.expression, bindings, seen);
    return receiver && `${receiver}.${node.name.text}`;
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
    const receiver = accessPath(node.expression, bindings, seen);
    return receiver && `${receiver}.${node.argumentExpression.text}`;
  }
  return undefined;
}

function constructedTarget(node) {
  let parent = node.parent;
  while (parent && (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent)))
    parent = parent.parent;
  if (
    parent &&
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  )
    return accessPath(parent.left, new Map());
  if (parent && ts.isVariableDeclaration(parent)) return memberName(parent.name);
  if (parent && ts.isPropertyDeclaration(parent)) return `this.${memberName(parent.name)}`;
  return undefined;
}

function calleeName(expression) {
  const node = unwrap(expression);
  if (ts.isIdentifier(node)) {
    const declaration = declarationFor(node);
    if (declaration && ts.isImportSpecifier(declaration))
      return declaration.propertyName?.text ?? declaration.name.text;
    return node.text;
  }
  return ts.isPropertyAccessExpression(node) ? node.name.text : undefined;
}

function optionProperties(object, bindings, seen = new Set()) {
  const resolved = resolveValue(object, bindings);
  if (!resolved || !ts.isObjectLiteralExpression(resolved) || seen.has(resolved)) return [];
  seen.add(resolved);
  return resolved.properties.flatMap((property) => {
    if (ts.isSpreadAssignment(property))
      return optionProperties(property.expression, bindings, seen);
    if (ts.isPropertyAssignment(property))
      return [{ name: memberName(property.name), value: property.initializer, node: property }];
    if (ts.isShorthandPropertyAssignment(property))
      return [{ name: property.name.text, value: property.name, node: property }];
    if (ts.isMethodDeclaration(property))
      return [{ name: memberName(property.name), value: property, node: property }];
    return [];
  });
}

/** Analyze callback roles and their reachable local function bodies, regardless of naming. */
export function analyzeCallbackProtocols(
  source,
  { file = 'input.ts', contracts = callbackProtocolContracts } = {},
) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const findings = [];
  const emitted = new Set();
  function report(rule, node, callee) {
    const key = `${rule}:${node.getStart(tree)}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    const location = tree.getLineAndCharacterOfPosition(node.getStart(tree));
    findings.push({ rule, file, line: location.line + 1, column: location.character + 1, callee });
  }
  function inspectSource(callback, target, contract) {
    const active = new Set();
    function inspectFunction(fn, bindings) {
      if (!fn?.body || active.has(fn)) return;
      active.add(fn);
      function walk(node) {
        if (ts.isCallExpression(node)) {
          const invoked = unwrap(node.expression);
          const readName = ts.isPropertyAccessExpression(invoked)
            ? invoked.name.text
            : ts.isElementAccessExpression(invoked) &&
                ts.isStringLiteral(invoked.argumentExpression)
              ? invoked.argumentExpression.text
              : undefined;
          if (
            readName &&
            contract.snapshotReadMethods.includes(readName) &&
            accessPath(invoked.expression, bindings) === target
          ) {
            report('source-loader-does-not-merge-published-state', node, contract.callee);
          }
          const fn = resolveCallback(invoked, bindings);
          if (fn) {
            const nextBindings = new Map(bindings);
            fn.parameters.forEach((parameter, index) => {
              if (node.arguments[index]) nextBindings.set(parameter, node.arguments[index]);
            });
            inspectFunction(fn, nextBindings);
          }
        }
        // Uninvoked function literals are not part of the source callback's execution.
        if (!functionLike(node)) ts.forEachChild(node, walk);
      }
      walk(fn.body);
      active.delete(fn);
    }
    inspectFunction(callback, new Map());
  }
  function visit(node) {
    if (ts.isNewExpression(node) || ts.isCallExpression(node)) {
      const contract = contracts.find((item) => item.callee === calleeName(node.expression));
      if (contract) {
        const options = node.arguments?.[contract.optionsArgument];
        for (const property of options ? optionProperties(options, new Map()) : []) {
          if (contract.externalPublicationCallbacks.includes(property.name))
            report(
              'publication-owner-does-not-commit-external-state',
              property.node,
              contract.callee,
            );
          const correlated = contract.correlatedCallbacks.find(
            (item) => item.name === property.name,
          );
          const callback = resolveCallback(property.value, new Map());
          if (correlated && callback && callback.parameters.length <= correlated.inputIndex)
            report(
              'correlated-callback-declares-correlation-input',
              property.node,
              contract.callee,
            );
          const target = constructedTarget(node);
          if (callback && target && contract.sourceCallbacks.includes(property.name))
            inspectSource(callback, target, contract);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return findings;
}

/** Discover all production sources. Tests/build outputs are excluded by file role, never feature. */
export function analyzeProductionCallbacks({
  layout = defaultResolvedLayout,
  sourceRoot = layout.sourceRoot,
  displayRoot = sourceRoot,
  contracts = callbackProtocolContracts,
} = {}) {
  function sources(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory())
        return /^(?:__tests__|tests|dist|build|node_modules)$/.test(entry.name)
          ? []
          : sources(fullPath);
      const relative = path.relative(sourceRoot, fullPath).replaceAll('\\', '/');
      return entry.isFile() &&
        layout.isSourceFile(`${layout.sourceRoot}/${relative}`) &&
        !layout.isExcluded(path.posix.join(displayRoot.replaceAll('\\', '/'), relative))
        ? [fullPath]
        : [];
    });
  }
  const files = existsSync(sourceRoot) ? sources(sourceRoot).sort() : [];
  const findings = files.flatMap((file) =>
    analyzeCallbackProtocols(readFileSync(file, 'utf8'), { file, contracts }),
  );
  return { filesScanned: files.length, findings };
}
