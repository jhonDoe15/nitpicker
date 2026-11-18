import type TypeScript from 'typescript';
import { fieldOf, listOf } from '../../../../shared/values/readers.mts';
import { chainOf, typescriptApi } from '../../adapters/typed/typescript-program.mts';
import type {
  BoundaryFinding,
  Configuration,
  Context,
  Layout,
  Role,
} from './typed/boundary-types.mts';
import {
  depthFirst,
  isNode,
  parseDiagnosticsOf,
  projectFilesUnder,
  syntaxChildren,
} from './typed/syntax-views.mts';
import { format as formatOutput } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleRoleBoundaries } from './runtime-dependency-boundaries.config.mts';
import { defaultResolvedLayout as untypedDefaultLayout } from '../layout.mjs';
import { appendAll } from '../../../../shared/lists/lists.mts';
import { blockingParseDiagnostics } from '../syntax/diagnostics/legacy-scripts.mts';

const ts = typescriptApi();

const defaultResolvedLayout: Layout = untypedDefaultLayout;

function requireStringList(value: unknown, label: string): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    listOf(value).some((entry) => typeof entry !== 'string' || entry.length === 0)
  ) {
    throw new TypeError(`${label} must be an array of nonempty strings`);
  }
}

function validateRole(role: unknown): asserts role is Role {
  const name = fieldOf(role, 'name');
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('Each module role requires a name');
  }
  for (const field of ['modules', 'forbiddenDependencies', 'forbiddenCalls']) {
    requireStringList(fieldOf(role, field), `${name}.${field}`);
  }
  if (listOf(fieldOf(role, 'modules')).length === 0) {
    throw new TypeError(`${name}.modules must select modules`);
  }
}

function matches(value: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => path.posix.matchesGlob(value, pattern));
}

function hasRuntimeImport(node: TypeScript.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause === undefined) return true;
  if (ts.isTypeOnlyImportDeclaration(clause)) return false;
  if (clause.name !== undefined || clause.namedBindings === undefined) return true;
  return (
    !ts.isNamedImports(clause.namedBindings) ||
    clause.namedBindings.elements.length === 0 ||
    clause.namedBindings.elements.some((binding) => !binding.isTypeOnly)
  );
}

function hasRuntimeExport(node: TypeScript.ExportDeclaration): boolean {
  if (node.isTypeOnly) return false;
  return (
    node.exportClause === undefined ||
    !ts.isNamedExports(node.exportClause) ||
    node.exportClause.elements.length === 0 ||
    node.exportClause.elements.some((binding) => !binding.isTypeOnly)
  );
}

function staticCallName(expression: TypeScript.Expression): string | undefined {
  const parts: string[] = [];
  for (const node of chainOf<TypeScript.Node>(expression, (current) =>
    'expression' in current && isNode(current.expression) ? current.expression : undefined,
  )) {
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

function parseSource(source: string, filename: string): TypeScript.SourceFile {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const diagnostics = blockingParseDiagnostics(filename, parseDiagnosticsOf(file));
  if (diagnostics.length === 0) return file;
  const messages = diagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  );
  throw new SyntaxError(`Unable to parse ${filename}: ${messages.join('; ')}`);
}

function report(
  context: Context,
  node: TypeScript.Node,
  { rule, target }: { readonly rule: string; readonly target: string },
): void {
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

function normalizedSpecifier(filename: string, text: string): string {
  if (!text.startsWith('.')) return text;
  return path.posix
    .normalize(path.posix.join(path.posix.dirname(filename), text))
    .replace(/^(\.\.\/)+/, '');
}

function recordDependency(
  context: Context,
  node: TypeScript.Node,
  { specifier, form }: { readonly specifier: TypeScript.Node | undefined; readonly form: string },
): void {
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

function moduleDependencyOf(
  node: TypeScript.Node,
): { readonly specifier: TypeScript.Node | undefined; readonly form: string } | undefined {
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

function recordCall(context: Context, node: TypeScript.CallExpression): void {
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

function inspectNode(context: Context, node: TypeScript.Node): void {
  const dependency = moduleDependencyOf(node);
  if (dependency !== undefined) {
    recordDependency(context, node, dependency);
    return;
  }
  if (ts.isCallExpression(node)) recordCall(context, node);
}

export function inspectModuleBoundary(
  source: string,
  filename: string,
  role: unknown,
): BoundaryFinding[] {
  validateRole(role);
  const context: Context = { file: parseSource(source, filename), filename, role, findings: [] };
  for (const node of depthFirst(context.file, syntaxChildren)) inspectNode(context, node);
  return context.findings;
}

function sourceFiles(
  root: string,
  exclude: readonly string[],
  { layout, displayRoot }: { readonly layout: Layout; readonly displayRoot: string },
): string[] {
  function relative(absolute: string): string {
    return path.relative(root, absolute).replaceAll('\\', '/');
  }
  function skipDirectory(absolute: string): boolean {
    return matches(relative(absolute), exclude) || matches(relative(absolute) + '/', exclude);
  }
  return [...projectFilesUnder(root, { skipDirectory })]
    .map(relative)
    .filter(
      (file) =>
        !matches(file, exclude) &&
        layout.isSourceFile(`${layout.sourceRoot}/${file}`) &&
        !layout.isExcluded(path.posix.join(displayRoot, file)),
    )
    .sort();
}

function validateConfiguration(configuration: unknown): asserts configuration is Configuration {
  const roles = fieldOf(configuration, 'roles');
  if (!Array.isArray(roles)) throw new TypeError('roles must be an array');
  requireStringList(fieldOf(configuration, 'exclude'), 'exclude');
  for (const role of listOf(roles)) {
    validateRole(role);
  }
  const roleNames = listOf(roles).map((role) => fieldOf(role, 'name'));
  if (new Set(roleNames).size !== roleNames.length)
    throw new TypeError('Module role names must be unique');
}

type BoundaryAnalysis = {
  readonly summary: {
    readonly discoveredModules: number;
    readonly classifiedModules: number;
    readonly findings: number;
  };
  readonly modules: { readonly source: string; readonly roles: string[] }[];
  readonly findings: BoundaryFinding[];
};

export function analyzeRuntimeBoundaries(
  root: string,
  configuration: unknown = moduleRoleBoundaries,
  {
    layout = defaultResolvedLayout,
    displayRoot = '',
  }: { readonly layout?: Layout; readonly displayRoot?: string } = {},
): BoundaryAnalysis {
  validateConfiguration(configuration);
  const sources = existsSync(root)
    ? sourceFiles(root, configuration.exclude, { layout, displayRoot })
    : [];
  const modules: { readonly source: string; readonly roles: string[] }[] = [];
  const findings: BoundaryFinding[] = [];
  for (const source of sources) {
    const roles = configuration.roles.filter((role) => matches(source, role.modules));
    if (roles.length === 0) continue;
    modules.push({ source, roles: roles.map((role) => role.name) });
    const content = readFileSync(path.join(root, source), 'utf8');
    for (const role of roles) appendAll(findings, inspectModuleBoundary(content, source, role));
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
