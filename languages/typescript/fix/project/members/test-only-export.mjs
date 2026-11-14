import path from 'node:path';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { existingRoots } from '../../../preset/layout.mjs';
import { loadPackages } from '../../../preset/unused-api/workspace/packages.mjs';
import { declined } from '../edits/text-edits.mjs';
import { verifyEdits } from '../edits/verify-edits.mjs';
import { importSpecifier } from '../imports/retarget.mjs';
import { moduleReferences } from '../model/module-references.mjs';
import { layoutOf, withProject } from '../model/project-model.mjs';
import { declarationOf, removalEdit } from '../reuse/declarations.mjs';
import { repointImport } from './repoint-import.mjs';

const RULE = { tool: 'dead-code', rule: 'test-only-export' };
const SUPPORT = /(?:^|\/)test-support\//u;
const CODE_FILE = /\.[cm]?[jt]sx?$/u;

function exportedDeclarations(sourceFile) {
  return sourceFile.statements.flatMap((statement) => {
    const isExported = (ts.getModifiers(statement) ?? []).some(
      ({ kind }) => kind === ts.SyntaxKind.ExportKeyword,
    );
    const declared = isExported ? declarationNames(statement) : [];
    return declared.map((name) => ({ name, statement }));
  });
}

function declarationNames(statement) {
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

function judge(project, { name, symbol, layout }) {
  const nameNode = nameNodeOf(project.sourceFile(name), symbol);
  const refs = (project.service.findReferences(project.absolute(name), nameNode.getStart()) ?? [])
    .flatMap(({ references }) => references)
    .map((reference) => project.nameOf(reference.fileName));
  const others = refs.filter((file) => file !== undefined && file !== name);
  function isTest(file) {
    return layout.isTestFile(file) || layout.isTestPath(file) || SUPPORT.test(file);
  }
  return {
    testOnly: others.length > 0 && others.every(isTest),
    local: refs.filter((file) => file === name).length > 1,
  };
}

function nameNodeOf(sourceFile, symbol) {
  const found = exportedDeclarations(sourceFile).find((entry) => entry.name === symbol);
  const { statement } = found;
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.find(({ name }) => name.text === symbol).name;
  }
  return statement.name;
}

function supportPath(context, name) {
  const layout = layoutOf(context.inputs);
  if (layout.colocatedTests) {
    return path.posix.join(path.posix.dirname(name), 'test-support', path.posix.basename(name));
  }
  const root = layout.sourceRoots.find((candidate) => name.startsWith(`${candidate}/`));
  const [testRoot = layout.testRoots[0]] = existingRoots(context.projectRoot, layout.testRoots);
  return path.posix.join(
    testRoot,
    'test-support',
    name.slice(root === undefined ? 0 : root.length + 1),
  );
}

function importsFor(project, { name, target, text }) {
  const used = new Set(text.match(/[A-Za-z_$][\w$]*/gu));
  return moduleReferences(project.sourceFile(name))
    .filter(({ kind }) => kind === 'import')
    .flatMap(({ node, specifier }) => {
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

function planModule(context, project, { name, symbols }) {
  const sourceFile = project.sourceFile(name);
  const target = supportPath(context, name);
  if (!context.accepts(target) || project.read(target) !== undefined) {
    return declined(`${target} is taken or outside the files --fix covers`);
  }
  const declarations = symbols.map((symbol) => declarationOf(sourceFile, symbol));
  const text = declarations.map(({ statement }) => statement.getText(sourceFile)).join('\n\n');
  const header = importsFor(project, { name, target, text });
  const created = { type: 'write', path: target, text: `${[...header, ''].join('\n')}${text}\n` };
  const removals = declarations.map(({ statement }) => removalEdit(name, statement));
  const repoints = repointImport(context, project, { from: name, target, symbols });
  if (repoints.declined !== undefined) {
    return repoints;
  }
  const edits = [created, ...removals, ...repoints.edits];
  const unsafe = verifyEdits(context, project, edits);
  return unsafe === undefined ? { edits } : declined(unsafe);
}

function packagesOf(context) {
  return loadPackages(context.projectRoot, layoutOf(context.inputs));
}

export const testOnlyExportRecipe = {
  id: 'typescript-test-only-export',
  rules: [RULE],
  presets: ['typescript', 'javascript'],
  scope: 'project',
  safety: 'review',
  plan(context) {
    const layout = layoutOf(context.inputs);
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
      const fixes = [];
      const notes = [];
      for (const name of candidates) {
        const judged = exportedDeclarations(project.sourceFile(name)).map(({ name: symbol }) => ({
          symbol,
          ...judge(project, { name, symbol, layout }),
        }));
        const testOnly = judged.filter((entry) => entry.testOnly);
        if (testOnly.length === 0) {
          continue;
        }
        const line = project.lineOf(
          name,
          nameNodeOf(project.sourceFile(name), testOnly[0].symbol).getStart(),
        );
        const local = testOnly.find((entry) => entry.local);
        const planned =
          local === undefined
            ? planModule(context, project, { name, symbols: testOnly.map((entry) => entry.symbol) })
            : declined(`${local.symbol} is also used inside ${name}`);
        if (planned.edits === undefined) {
          notes.push(`--fix left ${name}:${line} test-only-export: ${planned.declined}`);
        } else {
          fixes.push({ finding: { ...RULE, path: name, line }, edits: planned.edits });
        }
      }
      return { fixes, notes };
    });
  },
};
