import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isConstantName } from '../../../../../../shared/rules/copied-constants/copied-constants.mjs';
import { chainOf } from '../../../../../../shared/traversal.mjs';
import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { resolveModuleSpecifier } from '../../../modules/module-resolution.mjs';
import { isExported, scriptKindOf } from '../../../modules/module-sources.mjs';
import { readStamped } from '../../../modules/stamped-file-cache.mjs';
import { readLayout } from '../../../head-policy.mjs';

const MAX_REEXPORT_DEPTH = 4;
const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
const EMPTY = { constants: new Map(), reexports: [] };
const HIDDEN_MEMBERS = [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword];
const layout = readLayout();

function isWrapper(node) {
  return (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isTypeAssertionExpression(node)
  );
}

function unwrapped(node) {
  return chainOf(node, (link) => (isWrapper(link) ? link.expression : undefined)).at(-1);
}

function numberOf(node) {
  return ts.isNumericLiteral(node) ? Number(node.text.replaceAll('_', '')) : undefined;
}

function negatedNumber(node) {
  const negated = numberOf(unwrapped(node.operand));
  return negated === undefined ? undefined : { kind: 'number', value: -negated };
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
    return negatedNumber(node);
  }
  const value = numberOf(node);
  return value === undefined ? undefined : { kind: 'number', value };
}

function hasModifier(node, kind) {
  return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function isStaticConstant(member) {
  return (
    ts.isPropertyDeclaration(member) &&
    ts.isIdentifier(member.name) &&
    hasModifier(member, ts.SyntaxKind.StaticKeyword) &&
    hasModifier(member, ts.SyntaxKind.ReadonlyKeyword) &&
    !HIDDEN_MEMBERS.some((kind) => hasModifier(member, kind)) &&
    isConstantName(member.name.text)
  );
}

function classConstants(statement) {
  if (!ts.isClassDeclaration(statement) || statement.name === undefined) {
    return [];
  }
  return statement.members.filter(isStaticConstant).flatMap((member) => {
    const value = literalValue(member.initializer);
    return value === undefined ? [] : [[`${statement.name.text}.${member.name.text}`, value]];
  });
}

function localConstants(statement) {
  const isConst =
    ts.isVariableStatement(statement) &&
    (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
  if (!isConst) {
    return classConstants(statement);
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

function isLocalExportList(statement) {
  return statement.moduleSpecifier === undefined && statement.exportClause !== undefined;
}

function renamedHead(name, rename) {
  const [head, ...rest] = name.split('.');
  const renamed = rename(head);
  return renamed === undefined ? undefined : [renamed, ...rest].join('.');
}

function isConstantPath(name) {
  return name !== undefined && isConstantName(name.split('.').at(-1));
}

function listedConstants(statements, locals) {
  const listed = statements.filter(isLocalExportList).flatMap(exportedNames);
  return [...locals].flatMap(([name, value]) =>
    listed.flatMap(({ exported, local }) => {
      const renamed = renamedHead(name, (head) => (head === local ? exported : undefined));
      return isConstantPath(renamed) ? [[renamed, value]] : [];
    }),
  );
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
  const exportStatements = sourceFile.statements.filter(isValueExport);
  return {
    constants: new Map([
      ...sourceFile.statements
        .filter(isExported)
        .flatMap(localConstants)
        .filter(([name]) => isConstantPath(name)),
      ...listedConstants(exportStatements, locals),
    ]),
    reexports: exportStatements.map(reexportOf).filter((reexport) => reexport !== undefined),
  };
}

const moduleCache = new Map();

function parsedModule(file) {
  return readStamped(moduleCache, file, readModule) ?? EMPTY;
}

function isProductionModule(file, root) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  if (relative.startsWith('..') || path.isAbsolute(relative) || DECLARATION_FILE.test(file)) {
    return !DECLARATION_FILE.test(file);
  }
  return !(
    layout.isTestPath(relative) ||
    layout.isTestFile(relative) ||
    layout.isFixturePath(relative) ||
    layout.isGeneratedPath(relative)
  );
}

function throughReexport(reexport, outer) {
  if (reexport.names === undefined) {
    return outer;
  }
  return (name) => {
    const listed = reexport.names.find(({ local }) => local === name);
    return listed === undefined ? undefined : outer(listed.exported);
  };
}

function reexportSteps(step, { aliases }) {
  if (step.depth >= MAX_REEXPORT_DEPTH) {
    return [];
  }
  return parsedModule(step.file).reexports.flatMap((reexport) => {
    const target = resolveModuleSpecifier(reexport.specifier, step.file, { aliases });
    return target.kind === 'file'
      ? [
          {
            file: target.path,
            depth: step.depth + 1,
            rename: throughReexport(reexport, step.rename),
          },
        ]
      : [];
  });
}

/** The UPPER_SNAKE constants with one literal value that the production module `file` exports. */
export function exportedConstants(file, { root, aliases = [] }) {
  const found = new Map();
  const visited = new Set();
  const pending = [{ file, depth: 0, rename: (name) => name }];
  for (const step of pending) {
    if (visited.has(step.file) || !isProductionModule(step.file, root)) {
      continue;
    }
    visited.add(step.file);
    const named = [...parsedModule(step.file).constants].map(([name, value]) => [
      renamedHead(name, step.rename),
      value,
    ]);
    const fresh = named.filter(([name]) => isConstantPath(name) && !found.has(name));
    for (const [name, value] of fresh) {
      found.set(name, value);
    }
    pending.push(...reexportSteps(step, { aliases }));
  }
  return found;
}
