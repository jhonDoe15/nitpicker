import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { importSpecifier } from '../imports/retarget.mts';
import { moduleReferences } from '../model/module-references.mts';
import { withProject } from '../model/project-model.mts';
import { declarationOf, removalEdit } from '../reuse/declarations.mts';
import type {
  FixContext,
  Planned,
  Project,
  ProjectEdit,
  ProjectFix,
  ProjectRecipe,
} from '../typed/project-types.mts';
import { existingRoots } from '../typed/preset-views.mts';
import { declined, verifyEdits } from '../typed/project-views.mts';
import { fullLayoutOf, loadPackages } from '../typed/reuse-views.mts';
import type { FullLayout } from '../typed/reuse-views.mts';
import { repointImport } from './repoint-import.mts';

const ts = typescriptApi();

const RULE = { tool: 'dead-code', rule: 'test-only-export' };
const SUPPORT = /(?:^|\/)test-support\//u;
const CODE_FILE = /\.[cm]?[jt]sx?$/u;

type Exported = { readonly name: string; readonly statement: TypeScript.Statement };

function exportedDeclarations(sourceFile: TypeScript.SourceFile | undefined): Exported[] {
  return (sourceFile?.statements ?? []).flatMap((statement) => {
    const isExported = (
      (ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined) ?? []
    ).some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword);
    const declared = isExported ? declarationNames(statement) : [];
    return declared.map((name) => ({ name, statement }));
  });
}

function declarationNames(statement: TypeScript.Statement): string[] {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .map(({ name }) => name)
      .filter(ts.isIdentifier)
      .map(({ text }) => text);
  }
  const named =
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement);
  return named && statement.name !== undefined ? [statement.name.text] : [];
}

function judge(
  project: Project,
  {
    name,
    symbol,
    layout,
  }: { readonly name: string; readonly symbol: string; readonly layout: FullLayout },
): { readonly testOnly: boolean; readonly local: boolean } {
  const nameNode = nameNodeOf(project.sourceFile(name), symbol);
  const refs = (project.service.findReferences(project.absolute(name), nameNode.getStart()) ?? [])
    .flatMap(({ references }) => references)
    .map((reference) => project.nameOf(reference.fileName));
  const others = refs.flatMap((file) => (file !== undefined && file !== name ? [file] : []));
  function isTest(file: string): boolean {
    return layout.isTestFile(file) || layout.isTestPath(file) || SUPPORT.test(file);
  }
  return {
    testOnly: others.length > 0 && others.every(isTest),
    local: refs.filter((file) => file === name).length > 1,
  };
}

function nameNodeOf(
  sourceFile: TypeScript.SourceFile | undefined,
  symbol: string,
): TypeScript.Node {
  const found = exportedDeclarations(sourceFile).find((entry) => entry.name === symbol);
  const statement = found?.statement;
  if (statement !== undefined && ts.isVariableStatement(statement)) {
    const declared = statement.declarationList.declarations.find(
      ({ name }) => ts.isIdentifier(name) && name.text === symbol,
    );
    if (declared !== undefined) {
      return declared.name;
    }
  }
  if (
    statement !== undefined &&
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement)) &&
    statement.name !== undefined
  ) {
    return statement.name;
  }
  throw new TypeError(`${symbol} is not an exported declaration`);
}

function supportPath(context: FixContext, name: string): string {
  const layout = fullLayoutOf(context.inputs);
  if (layout.colocatedTests) {
    return path.posix.join(path.posix.dirname(name), 'test-support', path.posix.basename(name));
  }
  const root = layout.sourceRoots.find((candidate) => name.startsWith(`${candidate}/`));
  const [testRoot = layout.testRoots[0] ?? ''] = existingRoots(
    context.projectRoot,
    layout.testRoots,
  );
  return path.posix.join(
    testRoot,
    'test-support',
    name.slice(root === undefined ? 0 : root.length + 1),
  );
}

function importsFor(
  project: Project,
  { name, target, text }: { readonly name: string; readonly target: string; readonly text: string },
): string[] {
  const used = new Set(text.match(/[A-Za-z_$][\w$]*/gu));
  return moduleReferences(project.sourceFile(name))
    .filter(({ kind }) => kind === 'import')
    .flatMap(({ node, specifier }) => {
      if (!ts.isImportDeclaration(node) || specifier === undefined) {
        return [];
      }
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const locals = [
        ...(clause?.name === undefined ? [] : [clause.name.text]),
        ...(bindings !== undefined && ts.isNamedImports(bindings)
          ? bindings.elements.map((e) => e.name.text)
          : []),
        ...(bindings !== undefined && ts.isNamespaceImport(bindings) ? [bindings.name.text] : []),
      ];
      if (!locals.some((local) => used.has(local))) {
        return [];
      }
      const module = project.resolve(specifier, name);
      const rebased = module === undefined && !specifier.startsWith('.') ? specifier : undefined;
      const next =
        rebased ?? (module === undefined ? undefined : importSpecifier(project, target, module));
      return next === undefined
        ? []
        : [node.getText().replace(node.moduleSpecifier.getText(), `'${next}'`)];
    });
}

function planModule(
  context: FixContext,
  project: Project,
  { name, symbols }: { readonly name: string; readonly symbols: readonly string[] },
): Planned {
  const sourceFile = project.sourceFile(name);
  const target = supportPath(context, name);
  if (!context.accepts(target) || project.read(target) !== undefined) {
    return declined(`${target} is taken or outside the files --fix covers`);
  }
  const declarations = symbols.flatMap((symbol) => declarationOf(sourceFile, symbol) ?? []);
  const text = declarations.map(({ statement }) => statement.getText(sourceFile)).join('\n\n');
  const header = importsFor(project, { name, target, text });
  const created: ProjectEdit = {
    type: 'write',
    path: target,
    text: `${[...header, ''].join('\n')}${text}\n`,
  };
  const removals = declarations.map(({ statement }) => removalEdit(name, statement));
  const repoints = repointImport(context, project, { from: name, target, symbols });
  if (repoints.declined !== undefined) {
    return repoints;
  }
  const edits: ProjectEdit[] = [created, ...removals, ...repoints.edits];
  const unsafe = verifyEdits(context, project, edits);
  return unsafe === undefined ? { edits } : declined(unsafe);
}

function packagesOf(context: FixContext): ReturnType<typeof loadPackages> {
  return loadPackages(context.projectRoot, fullLayoutOf(context.inputs));
}

export const testOnlyExportRecipe: ProjectRecipe = {
  id: 'typescript-test-only-export',
  rules: [RULE],
  presets: ['typescript', 'javascript'],
  scope: 'project',
  safety: 'review',
  plan(context) {
    const layout = fullLayoutOf(context.inputs);
    const packages = packagesOf(context);
    const candidates = context.files
      .map(({ path: name }) => name)
      .filter(
        (name) =>
          CODE_FILE.test(name) &&
          layout.isSourceFile(name) &&
          !SUPPORT.test(name) &&
          !packages.packageOf(path.join(context.projectRoot, name))?.published &&
          !context.inputs?.isExcepted?.('test-only-export', name),
      );
    return withProject(context, (project) => {
      const fixes: ProjectFix[] = [];
      const notes: string[] = [];
      for (const name of candidates) {
        const judged = exportedDeclarations(project.sourceFile(name)).map(({ name: symbol }) => ({
          symbol,
          ...judge(project, { name, symbol, layout }),
        }));
        const testOnly = judged.filter((entry) => entry.testOnly);
        const [first] = testOnly;
        if (first === undefined) {
          continue;
        }
        const line = project.lineOf(
          name,
          nameNodeOf(project.sourceFile(name), first.symbol).getStart(),
        );
        const local = testOnly.find((entry) => entry.local);
        const planned: Planned =
          local === undefined
            ? planModule(context, project, { name, symbols: testOnly.map((entry) => entry.symbol) })
            : declined(`${local.symbol} is also used inside ${name}`);
        if (planned.edits === undefined) {
          notes.push(`--fix left ${name}:${String(line)} test-only-export: ${planned.declined}`);
        } else {
          fixes.push({ finding: { ...RULE, path: name, line }, edits: planned.edits });
        }
      }
      return { fixes, notes };
    });
  },
};
