import { readFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import {
  isExported as untypedIsExported,
  scriptKindOf as untypedScriptKindOf,
} from '../../../modules/module-sources.mjs';
import { readLayout } from '../../rules/typed/policy-views.mts';
import { ts, variableNames } from '../../rules/typed/typescript-views.mts';
import {
  DEFAULT_EXPORT,
  isConstantName,
  readStamped,
  resolvedFile,
  type ConstantValue,
  type ModuleAlias,
} from './copied-constants-views.mts';
import { hasModifier, localConstants, type ConstantEntry } from './constant-literals.mts';

type ExportedName = { readonly exported: string; readonly local: string };
type LocalExport = TypeScript.ExportDeclaration & {
  readonly exportClause: TypeScript.NamedExports;
};
type Rename = (name: string) => string | undefined;
type Step = { readonly file: string; readonly depth: number; readonly rename: Rename };
type ModuleCache = Map<string, { readonly stamp: string; readonly value: ParsedModule }>;
export type Reexport = {
  readonly specifier: string;
  readonly names: readonly ExportedName[] | undefined;
};
export type ParsedModule = {
  readonly constants: ReadonlyMap<string, ConstantValue>;
  readonly reexports: readonly Reexport[];
  readonly defined: ReadonlySet<string>;
};

const isExported: (statement: TypeScript.Node) => boolean = untypedIsExported;
const scriptKindOf: (file: string) => TypeScript.ScriptKind = untypedScriptKindOf;

export const MAX_REEXPORT_DEPTH = 4;
const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
const EMPTY: ParsedModule = { constants: new Map(), reexports: [], defined: new Set() };
const JAVASCRIPT_FILE = /\.[cm]?jsx?$/u;
const layout = readLayout();

function exportedNames(clause: TypeScript.NamedExports): ExportedName[] {
  return clause.elements
    .filter((element) => !element.isTypeOnly)
    .map((element) => ({
      exported: element.name.text,
      local: (element.propertyName ?? element.name).text,
    }));
}

function isValueExport(statement: TypeScript.Node): statement is TypeScript.ExportDeclaration {
  return ts.isExportDeclaration(statement) && !statement.isTypeOnly;
}

function reexportOf(statement: TypeScript.ExportDeclaration): Reexport | undefined {
  const specifier = statement.moduleSpecifier;
  if (specifier === undefined || !ts.isStringLiteral(specifier)) {
    return undefined;
  }
  if (statement.exportClause === undefined) {
    return { specifier: specifier.text, names: undefined };
  }
  return ts.isNamedExports(statement.exportClause)
    ? { specifier: specifier.text, names: exportedNames(statement.exportClause) }
    : undefined;
}

function isLocalExportList(statement: TypeScript.ExportDeclaration): statement is LocalExport {
  return (
    statement.moduleSpecifier === undefined &&
    statement.exportClause !== undefined &&
    ts.isNamedExports(statement.exportClause)
  );
}

function renamedHead(name: string, rename: Rename): string | undefined {
  const [head = '', ...rest] = name.split('.');
  const renamed = rename(head);
  return renamed === undefined ? undefined : [renamed, ...rest].join('.');
}

function isConstantPath(name: string | undefined): name is string {
  return name !== undefined && isConstantName(name.split('.').at(-1) ?? '');
}

function listedConstants(
  statements: readonly TypeScript.ExportDeclaration[],
  locals: ReadonlyMap<string, ConstantValue>,
): ConstantEntry[] {
  const listed = statements
    .filter(isLocalExportList)
    .flatMap((statement) => exportedNames(statement.exportClause));
  return [...locals].flatMap(([name, value]) =>
    listed.flatMap(({ exported, local }) => {
      const shown = exported === DEFAULT_EXPORT && name.includes('.') ? local : exported;
      const renamed = renamedHead(name, (head) => (head === local ? shown : undefined));
      return isConstantPath(renamed) ? [[renamed, value]] : [];
    }),
  );
}

function declaredNames(statement: TypeScript.Statement): string[] {
  if (ts.isVariableStatement(statement)) {
    return variableNames(statement);
  }
  const named = ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement);
  if (named && hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
    return [DEFAULT_EXPORT];
  }
  const own = named || ts.isEnumDeclaration(statement) ? statement.name?.text : undefined;
  return own === undefined ? [] : [own];
}

function definedNames(statements: readonly TypeScript.Statement[]): Set<string> {
  const declared = statements.filter(isExported).flatMap(declaredNames);
  const listed = statements
    .filter(isValueExport)
    .filter(isLocalExportList)
    .flatMap((statement) => exportedNames(statement.exportClause));
  const assigned = statements.some((statement) => ts.isExportAssignment(statement));
  const names = [...declared, ...listed.map(({ exported }) => exported)];
  return new Set(assigned ? [...names, DEFAULT_EXPORT] : names);
}

function readModule(file: string): ParsedModule {
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKindOf(file),
  );
  const javascript = JAVASCRIPT_FILE.test(file);
  const locals = new Map(
    sourceFile.statements.flatMap((statement) => localConstants(statement, javascript)),
  );
  const exportStatements = sourceFile.statements.filter(isValueExport);
  return {
    defined: definedNames(sourceFile.statements),
    constants: new Map([
      ...sourceFile.statements
        .filter(isExported)
        .flatMap((statement) => localConstants(statement, javascript))
        .filter(([name]) => isConstantPath(name)),
      ...listedConstants(exportStatements, locals),
    ]),
    reexports: exportStatements.map(reexportOf).filter((reexport) => reexport !== undefined),
  };
}

const moduleCache: ModuleCache = new Map();

export function parsedModule(file: string): ParsedModule {
  return readStamped(moduleCache, file, readModule) ?? EMPTY;
}

export function isProductionModule(file: string, root: string): boolean {
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

function throughReexport(reexport: Reexport, outer: Rename): Rename {
  const { names } = reexport;
  if (names === undefined) {
    return outer;
  }
  return (name) => {
    const listed = names.find(({ local }) => local === name);
    return listed === undefined ? undefined : outer(listed.exported);
  };
}

function reexportSteps(
  step: Step,
  { aliases }: { readonly aliases: readonly ModuleAlias[] },
): Step[] {
  if (step.depth >= MAX_REEXPORT_DEPTH) {
    return [];
  }
  return parsedModule(step.file).reexports.flatMap((reexport) => {
    const target = resolvedFile(reexport.specifier, step.file, { aliases });
    return target !== undefined
      ? [
          {
            file: target,
            depth: step.depth + 1,
            rename: throughReexport(reexport, step.rename),
          },
        ]
      : [];
  });
}

export function exportedConstants(
  file: string,
  {
    root,
    aliases = [],
    only,
  }: {
    readonly root: string;
    readonly aliases?: readonly ModuleAlias[];
    readonly only?: ReadonlySet<string> | undefined;
  },
): Map<string, ConstantValue> {
  const found = new Map<string, ConstantValue>();
  const visited = new Set<string>();
  const pending: Step[] = [{ file, depth: 0, rename: (name) => name }];
  for (const step of pending) {
    if (visited.has(step.file) || !isProductionModule(step.file, root)) {
      continue;
    }
    visited.add(step.file);
    const named = [...parsedModule(step.file).constants].map(
      ([name, value]): readonly [string | undefined, ConstantValue] => [
        renamedHead(name, step.rename),
        value,
      ],
    );
    const wanted = only === undefined || step.depth === 0 || only.has(step.file);
    const fresh = named.flatMap<ConstantEntry>(([name, value]) =>
      wanted && isConstantPath(name) && !found.has(name) ? [[name, value]] : [],
    );
    for (const [name, value] of fresh) {
      found.set(name, value);
    }
    pending.push(...reexportSteps(step, { aliases }));
  }
  return found;
}
