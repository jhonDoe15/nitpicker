import { filesUnder } from '../../../../shared/filesystem.mjs';
import { depthFirst } from '../../../../shared/traversal.mjs';
import { syntaxChildren } from '../syntax/children.mjs';
import { chainOf } from '../../../../shared/traversal.mjs';
import { format as formatOutput } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ts } from '../../typescript-api/typescript-api.mjs';
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
  const parts = [];
  for (const node of chainOf(expression, (current) => current.expression)) {
    if (ts.isIdentifier(node)) return [node.text, ...parts.toReversed()].join('.');
    if (ts.isParenthesizedExpression(node)) continue;
    if (ts.isPropertyAccessExpression(node)) {
      parts.push(node.name.text);
      continue;
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
      parts.push(node.argumentExpression.text);
      continue;
    }
    return undefined;
  }
  return undefined;
}

function parseSource(source, filename) {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  if (file.parseDiagnostics.length === 0) return file;
  const messages = file.parseDiagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  );
  throw new SyntaxError(`Unable to parse ${filename}: ${messages.join('; ')}`);
}

function report(context, node, { rule, target }) {
  const location = context.file.getLineAndCharacterOfPosition(node.getStart(context.file));
  context.findings.push({
    source: context.filename,
    role: context.role.name,
    rule,
    target,
    line: location.line + 1,
    column: location.character + 1,
  });
}

function normalizedSpecifier(filename, text) {
  if (!text.startsWith('.')) return text;
  return path.posix
    .normalize(path.posix.join(path.posix.dirname(filename), text))
    .replace(/^(\.\.\/)+/, '');
}

function recordDependency(context, node, { specifier, form }) {
  if (specifier === undefined || !ts.isStringLiteralLike(specifier)) {
    report(context, node, { rule: 'unresolved-runtime-dependency', target: form });
    return;
  }
  const { forbiddenDependencies } = context.role;
  const normalized = normalizedSpecifier(context.filename, specifier.text);
  if (
    matches(specifier.text, forbiddenDependencies) ||
    matches(normalized, forbiddenDependencies)
  ) {
    report(context, node, { rule: 'forbidden-runtime-dependency', target: specifier.text });
  }
}

function moduleDependencyOf(node) {
  if (ts.isImportDeclaration(node) && hasRuntimeImport(node)) {
    return { specifier: node.moduleSpecifier, form: 'import' };
  }
  if (
    ts.isExportDeclaration(node) &&
    node.moduleSpecifier !== undefined &&
    hasRuntimeExport(node)
  ) {
    return { specifier: node.moduleSpecifier, form: 'export' };
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    !node.isTypeOnly &&
    ts.isExternalModuleReference(node.moduleReference)
  ) {
    return { specifier: node.moduleReference.expression, form: 'require' };
  }
  return undefined;
}

function recordCall(context, node) {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    recordDependency(context, node, { specifier: node.arguments[0], form: 'import' });
    return;
  }
  const name = staticCallName(node.expression);
  if (name === 'require') {
    recordDependency(context, node, { specifier: node.arguments[0], form: 'require' });
    return;
  }
  if (name !== undefined && matches(name, context.role.forbiddenCalls)) {
    report(context, node, { rule: 'forbidden-runtime-call', target: name });
  }
}

function inspectNode(context, node) {
  const dependency = moduleDependencyOf(node);
  if (dependency !== undefined) {
    recordDependency(context, node, dependency);
    return;
  }
  if (ts.isCallExpression(node)) recordCall(context, node);
}

export function inspectModuleBoundary(source, filename, role) {
  validateRole(role);
  const context = { file: parseSource(source, filename), filename, role, findings: [] };
  for (const node of depthFirst(context.file, syntaxChildren)) inspectNode(context, node);
  return context.findings;
}

function sourceFiles(root, exclude, { layout, displayRoot }) {
  function relative(absolute) {
    return path.relative(root, absolute).replaceAll('\\', '/');
  }
  function skipDirectory(absolute) {
    return matches(relative(absolute), exclude) || matches(relative(absolute) + '/', exclude);
  }
  return [...filesUnder(root, { skipDirectory })]
    .map(relative)
    .filter(
      (file) =>
        !matches(file, exclude) &&
        layout.isSourceFile(`${layout.sourceRoot}/${file}`) &&
        !layout.isExcluded(path.posix.join(displayRoot, file)),
    )
    .sort();
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
    process.stdout.write(formatOutput(JSON.stringify(report, null, 2)) + '\n');
    process.exitCode = report.findings.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(formatOutput(error) + '\n');
    process.exitCode = 2;
  }
}
