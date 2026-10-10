import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { moduleRoleBoundaries } from './runtime-dependency-boundaries.config.mjs';
import { defaultResolvedLayout } from '../layout.mjs';

function requireStringList(value, label) {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry.length === 0)
  ) {
    throw new TypeError(`${label} must be an array of nonempty strings`);
  }
}

function validateRole(role) {
  if (typeof role?.name !== 'string' || role.name.length === 0) {
    throw new TypeError('Each module role requires a name');
  }
  for (const field of ['modules', 'forbiddenDependencies', 'forbiddenCalls']) {
    requireStringList(role[field], `${role.name}.${field}`);
  }
  if (role.modules.length === 0) throw new TypeError(`${role.name}.modules must select modules`);
}

function matches(value, patterns) {
  return patterns.some((pattern) => path.posix.matchesGlob(value, pattern));
}

function hasRuntimeImport(node) {
  const clause = node.importClause;
  if (clause === undefined) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name !== undefined || clause.namedBindings === undefined) return true;
  return (
    !ts.isNamedImports(clause.namedBindings) ||
    clause.namedBindings.elements.length === 0 ||
    clause.namedBindings.elements.some((binding) => !binding.isTypeOnly)
  );
}

function hasRuntimeExport(node) {
  if (node.isTypeOnly) return false;
  return (
    node.exportClause === undefined ||
    !ts.isNamedExports(node.exportClause) ||
    node.exportClause.elements.length === 0 ||
    node.exportClause.elements.some((binding) => !binding.isTypeOnly)
  );
}

function staticCallName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isParenthesizedExpression(expression)) return staticCallName(expression.expression);
  if (ts.isPropertyAccessExpression(expression)) {
    const owner = staticCallName(expression.expression);
    return owner === undefined ? undefined : `${owner}.${expression.name.text}`;
  }
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    const owner = staticCallName(expression.expression);
    return owner === undefined ? undefined : `${owner}.${expression.argumentExpression.text}`;
  }
  return undefined;
}

/** Inspect declared runtime dependency edges and explicitly forbidden calls for one module role. */
export function inspectModuleBoundary(source, filename, role) {
  validateRole(role);
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  if (file.parseDiagnostics.length > 0) {
    const messages = file.parseDiagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    );
    throw new SyntaxError(`Unable to parse ${filename}: ${messages.join('; ')}`);
  }
  const findings = [];
  function report(node, rule, target) {
    const location = file.getLineAndCharacterOfPosition(node.getStart(file));
    findings.push({
      source: filename,
      role: role.name,
      rule,
      target,
      line: location.line + 1,
      column: location.character + 1,
    });
  }
  function dependency(node, specifier, form) {
    if (specifier === undefined || !ts.isStringLiteralLike(specifier)) {
      report(node, 'unresolved-runtime-dependency', form);
    } else {
      // Resolve relative spelling before matching; globstars do not traverse ".." segments.
      const normalized = specifier.text.startsWith('.')
        ? path.posix
            .normalize(path.posix.join(path.posix.dirname(filename), specifier.text))
            .replace(/^(\.\.\/)+/, '')
        : specifier.text;
      if (
        matches(specifier.text, role.forbiddenDependencies) ||
        matches(normalized, role.forbiddenDependencies)
      ) {
        report(node, 'forbidden-runtime-dependency', specifier.text);
      }
    }
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) && hasRuntimeImport(node)) {
      dependency(node, node.moduleSpecifier, 'import');
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      hasRuntimeExport(node)
    ) {
      dependency(node, node.moduleSpecifier, 'export');
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      dependency(node, node.moduleReference.expression, 'require');
    } else if (ts.isCallExpression(node)) {
      const name = staticCallName(node.expression);
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        dependency(node, node.arguments[0], 'import');
      } else if (name === 'require') {
        dependency(node, node.arguments[0], 'require');
      } else if (name !== undefined && matches(name, role.forbiddenCalls)) {
        report(node, 'forbidden-runtime-call', name);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return findings;
}

function sourceFiles(root, exclude, { layout, displayRoot }, directory = '') {
  const found = [];
  for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name);
    if (matches(relative, exclude) || (entry.isDirectory() && matches(relative + '/', exclude)))
      continue;
    if (entry.isDirectory())
      found.push(...sourceFiles(root, exclude, { layout, displayRoot }, relative));
    else if (
      entry.isFile() &&
      layout.isSourceFile(`${layout.sourceRoot}/${relative}`) &&
      !layout.isExcluded(path.posix.join(displayRoot, relative))
    )
      found.push(relative);
  }
  return found.sort();
}

function validateConfiguration(configuration) {
  if (!Array.isArray(configuration?.roles)) throw new TypeError('roles must be an array');
  requireStringList(configuration.exclude, 'exclude');
  for (const role of configuration.roles) {
    validateRole(role);
  }
  const roleNames = configuration.roles.map((role) => role.name);
  if (new Set(roleNames).size !== roleNames.length)
    throw new TypeError('Module role names must be unique');
}

/** Discover production modules by configured role patterns; return findings and coverage together. */
export function analyzeRuntimeBoundaries(
  root,
  configuration = moduleRoleBoundaries,
  { layout = defaultResolvedLayout, displayRoot = '' } = {},
) {
  validateConfiguration(configuration);
  const sources = existsSync(root)
    ? sourceFiles(root, configuration.exclude, { layout, displayRoot })
    : [];
  const modules = [];
  const findings = [];
  for (const source of sources) {
    const roles = configuration.roles.filter((role) => matches(source, role.modules));
    if (roles.length === 0) continue;
    modules.push({ source, roles: roles.map((role) => role.name) });
    const content = readFileSync(path.join(root, source), 'utf8');
    for (const role of roles) findings.push(...inspectModuleBoundary(content, source, role));
  }
  return {
    summary: {
      discoveredModules: sources.length,
      classifiedModules: modules.length,
      findings: findings.length,
    },
    modules,
    findings,
  };
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const report = analyzeRuntimeBoundaries(
      path.resolve(process.argv[2] ?? defaultResolvedLayout.sourceRoot),
    );
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.findings.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 2;
  }
}
