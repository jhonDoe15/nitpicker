import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isConstantName } from '../../../../../../shared/rules/copied-constants/copied-constants.mjs';
import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { resolveModuleSpecifier } from '../../../modules/module-resolution.mjs';
import { scriptKindOf } from '../../../modules/module-sources.mjs';
import { readStamped } from '../../../modules/stamped-file-cache.mjs';

const MAX_REEXPORT_DEPTH = 4;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
const TEST_FOLDERS = new Set([
  'node_modules',
  'test',
  'tests',
  '__tests__',
  '__mocks__',
  '__fixtures__',
  'fixtures',
  'test-support',
  'testing',
  'e2e',
]);
const EMPTY = { constants: new Map(), reexports: [] };

function unwrapped(node) {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function numberOf(node) {
  return ts.isNumericLiteral(node) ? Number(node.text.replaceAll('_', '')) : undefined;
}

function literalValue(initializer) {
  const node = initializer === undefined ? undefined : unwrapped(initializer);
  if (node === undefined) {
    return undefined;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { kind: 'string', value: node.text };
  }
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    const negated = numberOf(unwrapped(node.operand));
    return negated === undefined ? undefined : { kind: 'number', value: -negated };
  }
  const value = numberOf(node);
  return value === undefined ? undefined : { kind: 'number', value };
}

function isExported(statement) {
  return statement.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function localConstants(statement) {
  const isConst =
    ts.isVariableStatement(statement) &&
    (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
  if (!isConst) {
    return [];
  }
  return statement.declarationList.declarations.flatMap(({ name, initializer }) => {
    const value = ts.isIdentifier(name) ? literalValue(initializer) : undefined;
    return value === undefined ? [] : [[name.text, value]];
  });
}

function exportedNames(statement) {
  return statement.exportClause.elements
    .filter((element) => !element.isTypeOnly)
    .map((element) => ({
      exported: element.name.text,
      local: (element.propertyName ?? element.name).text,
    }));
}

function isValueExport(statement) {
  return ts.isExportDeclaration(statement) && !statement.isTypeOnly;
}

function reexportOf(statement) {
  const specifier = statement.moduleSpecifier;
  if (specifier === undefined || !ts.isStringLiteral(specifier)) {
    return undefined;
  }
  if (statement.exportClause === undefined) {
    return { specifier: specifier.text, names: undefined };
  }
  return ts.isNamedExports(statement.exportClause)
    ? { specifier: specifier.text, names: exportedNames(statement) }
    : undefined;
}

function readModule(file) {
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKindOf(file),
  );
  const locals = new Map(sourceFile.statements.flatMap(localConstants));
  const constants = new Map(
    sourceFile.statements
      .filter(isExported)
      .flatMap(localConstants)
      .filter(([name]) => isConstantName(name)),
  );
  const reexports = [];
  for (const statement of sourceFile.statements.filter(isValueExport)) {
    const reexport = reexportOf(statement);
    if (reexport !== undefined) {
      reexports.push(reexport);
    } else if (statement.moduleSpecifier === undefined && statement.exportClause !== undefined) {
      for (const { exported, local } of exportedNames(statement)) {
        if (locals.has(local) && isConstantName(exported)) {
          constants.set(exported, locals.get(local));
        }
      }
    }
  }
  return { constants, reexports };
}

const moduleCache = new Map();

function parsedModule(file) {
  return readStamped(moduleCache, file, readModule) ?? EMPTY;
}

function isProductionModule(file, root) {
  const relative = path.relative(root, file);
  const parts = (relative.startsWith('..') ? file : relative).split(path.sep);
  return (
    !TEST_FILE.test(file) &&
    !DECLARATION_FILE.test(file) &&
    !parts.slice(0, -1).some((part) => TEST_FOLDERS.has(part))
  );
}

function reexported(reexport, inner) {
  if (reexport.names === undefined) {
    return [...inner];
  }
  return reexport.names.flatMap(({ exported, local }) =>
    inner.has(local) && isConstantName(exported) ? [[exported, inner.get(local)]] : [],
  );
}

function collect(file, { depth, visited, aliases, root }) {
  if (visited.has(file) || !isProductionModule(file, root)) {
    return new Map();
  }
  visited.add(file);
  const { constants, reexports } = parsedModule(file);
  const found = new Map(constants);
  for (const reexport of depth < MAX_REEXPORT_DEPTH ? reexports : []) {
    const target = resolveModuleSpecifier(reexport.specifier, file, { aliases });
    const inner =
      target.kind === 'file'
        ? collect(target.path, { depth: depth + 1, visited, aliases, root })
        : new Map();
    for (const [name, value] of reexported(reexport, inner)) {
      if (!found.has(name)) {
        found.set(name, value);
      }
    }
  }
  return found;
}

/** The UPPER_SNAKE constants with one literal value that the production module `file` exports. */
export function exportedConstants(file, { root, aliases = [] }) {
  return collect(file, { depth: 0, visited: new Set(), aliases, root });
}
