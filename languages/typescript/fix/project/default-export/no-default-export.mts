import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { lintRecipe, type PlanRequest } from '../plan/lint-recipe.mts';
import { defaultExportSelectors, frameworkConventions } from '../typed/policy-views.mts';
import type { Planned, Project, ReplaceEdit } from '../typed/project-types.mts';
import {
  declined,
  inCasing,
  productionScope,
  replaceEdit,
  symbolReferenceProblem,
  verifyEdits,
} from '../typed/project-views.mts';
import { importerEdits as untypedImporterEdits } from './importer-edits.mjs';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../../shared/paths/glob.mjs';

type DefaultExport =
  | { readonly kind: 'assignment'; readonly node: TypeScript.ExportAssignment }
  | { readonly kind: 'declaration'; readonly node: NamedDefault }
  | {
      readonly kind: 'specifier';
      readonly node: TypeScript.ExportSpecifier;
      readonly statement: TypeScript.Statement;
    };

type NamedDefault =
  TypeScript.FunctionDeclaration | TypeScript.ClassDeclaration | TypeScript.InterfaceDeclaration;

type InternalApi = typeof TypeScript & {
  readonly isIdentifierText: (name: string, target: TypeScript.ScriptTarget) => boolean;
  readonly stringToToken: (text: string) => TypeScript.SyntaxKind | undefined;
};

type Definition = { readonly exportName: string; readonly edits: readonly ReplaceEdit[] };

const ts = internalApi(typescriptApi());

const escapeRegExp: (value: string) => string = untypedEscapeRegExp;

const importerEdits: (
  project: Project,
  request: {
    readonly target: string;
    readonly exportName: string;
    readonly accepts: (name: string) => boolean;
  },
) => Planned = untypedImporterEdits;

function isInternalApi(api: typeof TypeScript): api is InternalApi {
  return (
    typeof fieldOf(api, 'isIdentifierText') === 'function' &&
    typeof fieldOf(api, 'stringToToken') === 'function'
  );
}

function internalApi(api: typeof TypeScript): InternalApi {
  if (!isInternalApi(api)) {
    throw new TypeError('The selected TypeScript API has no identifier helpers');
  }
  return api;
}

function isNamedDefault(statement: TypeScript.Statement): statement is NamedDefault {
  return (
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement)
  );
}

function hasModifier(
  node: TypeScript.Node,
  kind: TypeScript.SyntaxKind,
): TypeScript.Modifier | TypeScript.ModifierLike | undefined {
  return ((ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined) ?? []).find(
    (modifier) => modifier.kind === kind,
  );
}

function defaultExportOf(sourceFile: TypeScript.SourceFile): DefaultExport | undefined {
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && statement.isExportEquals !== true) {
      return { kind: 'assignment', node: statement };
    }
    if (
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword) !== undefined &&
      isNamedDefault(statement)
    ) {
      return { kind: 'declaration', node: statement };
    }
    const elements =
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
        ? statement.exportClause.elements
        : [];
    const specifier = elements.find(({ name }) => name.text === 'default');
    if (specifier !== undefined) {
      return { kind: 'specifier', node: specifier, statement };
    }
  }
  return undefined;
}

function derivedName(
  name: string,
  sourceFile: TypeScript.SourceFile,
  casing: string,
): string | undefined {
  const parsed = path.posix.parse(name);
  const base = parsed.name.split('.')[0] ?? '';
  const stem = base === 'index' ? path.posix.basename(parsed.dir) : base;
  const derived = inCasing(stem, casing);
  const usable =
    derived !== undefined &&
    ts.isIdentifierText(derived, ts.ScriptTarget.Latest) &&
    ts.stringToToken(derived) === undefined &&
    !new RegExp(String.raw`\b${escapeRegExp(derived)}\b`, 'u').test(sourceFile.text);
  return usable ? derived : undefined;
}

function namedDeclaration(
  name: string,
  sourceFile: TypeScript.SourceFile,
  node: NamedDefault,
): Definition | undefined {
  const modifier = hasModifier(node, ts.SyntaxKind.DefaultKeyword);
  if (modifier === undefined) {
    return undefined;
  }
  const removal = replaceEdit(name, [modifier.getStart(), modifier.end + 1], '');
  if (node.name !== undefined) {
    return { exportName: node.name.text, edits: [removal] };
  }
  const isClass = ts.isClassDeclaration(node);
  const exportName = derivedName(name, sourceFile, isClass ? 'PascalCase' : 'camelCase');
  const keyword = node
    .getChildren(sourceFile)
    .find(
      ({ kind }) => kind === ts.SyntaxKind.FunctionKeyword || kind === ts.SyntaxKind.ClassKeyword,
    );
  const asterisk = ts.isFunctionDeclaration(node) ? node.asteriskToken : undefined;
  const at = asterisk === undefined ? (keyword ?? node).end : asterisk.end;
  const spaced = sourceFile.text[at] === ' ' && !isClass ? 1 : 0;
  return exportName === undefined
    ? undefined
    : { exportName, edits: [removal, replaceEdit(name, [at, at + spaced], ` ${exportName}`)] };
}

function assignment(
  name: string,
  sourceFile: TypeScript.SourceFile,
  node: TypeScript.ExportAssignment,
): Definition | undefined {
  const { expression } = node;
  if (ts.isIdentifier(expression)) {
    const text = `export { ${expression.text} };`;
    return {
      exportName: expression.text,
      edits: [replaceEdit(name, [node.getStart(), node.end], text)],
    };
  }
  const exportName = derivedName(name, sourceFile, 'camelCase');
  return exportName === undefined
    ? undefined
    : {
        exportName,
        edits: [
          replaceEdit(
            name,
            [node.getStart(), expression.getStart()],
            `export const ${exportName} = `,
          ),
        ],
      };
}

function definitionPlan(
  name: string,
  sourceFile: TypeScript.SourceFile,
  found: DefaultExport,
): Definition | undefined {
  if (found.kind === 'declaration') {
    return namedDeclaration(name, sourceFile, found.node);
  }
  if (found.kind === 'assignment') {
    return assignment(name, sourceFile, found.node);
  }
  const { node, statement } = found;
  if (fieldOf(statement, 'moduleSpecifier') !== undefined || node.propertyName === undefined) {
    return undefined;
  }
  return {
    exportName: node.propertyName.text,
    edits: [replaceEdit(name, [node.getStart(), node.end], node.propertyName.text)],
  };
}

function definitionOf(project: Project, name: string): Definition | 'none' | undefined {
  const sourceFile = project.sourceFile(name);
  const found = sourceFile === undefined ? undefined : defaultExportOf(sourceFile);
  return sourceFile === undefined || found === undefined
    ? 'none'
    : definitionPlan(name, sourceFile, found);
}

function planMessage({ context, project, name }: PlanRequest): Planned | undefined {
  const definition = definitionOf(project, name);
  if (definition === 'none') {
    return undefined;
  }
  if (definition === undefined) {
    return declined('the default export has no name to give it');
  }
  const problem = symbolReferenceProblem(project, { target: name, exportName: 'default' });
  if (problem !== undefined) {
    return declined(problem);
  }
  const importers = importerEdits(project, {
    target: name,
    ...definition,
    accepts: context.accepts,
  });
  if (importers.declined !== undefined) {
    return importers;
  }
  const edits = [...definition.edits, ...importers.edits];
  const unsafe = verifyEdits(context, project, edits);
  return unsafe === undefined ? { edits } : declined(unsafe);
}

export const noDefaultExportRecipe = lintRecipe({
  id: 'typescript-no-default-export',
  ruleId: 'no-default-export',
  scopeOf: (context) =>
    productionScope(context.inputs, frameworkConventions(context.projectRoot).defaultExports),
  optionsOf: () => defaultExportSelectors,
  planMessage,
});
