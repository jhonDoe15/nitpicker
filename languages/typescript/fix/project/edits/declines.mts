import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { moduleReferences } from '../model/module-references.mts';
import type { ModuleReference } from '../model/reference-types.mts';
import type { Project } from '../typed/project-types.mts';
import { packageEntryProblem, templateImporterProblem } from './hidden-importers.mts';

const ts = typescriptApi();

function couldReach({
  reference,
  from,
  target,
}: {
  readonly reference: ModuleReference;
  readonly from: string;
  readonly target: string;
}): boolean {
  const { prefix = '' } = reference;
  if (prefix === '') {
    return true;
  }
  if (!(prefix.startsWith('.') || prefix.startsWith('/'))) {
    return false;
  }
  const directory = path.posix.normalize(path.posix.join(path.posix.dirname(from), prefix));
  return target.startsWith(directory.slice(0, directory.lastIndexOf('/') + 1));
}

function loadsDynamically(reference: ModuleReference): boolean {
  switch (reference.kind) {
    case 'dynamic':
    case 'require':
      return true;
    case 'import':
    case 'export':
    case 'type-import':
      return false;
  }
}

function referenceProblem({
  name,
  reference,
  target,
}: {
  readonly name: string;
  readonly reference: ModuleReference;
  readonly target: string;
}): string | undefined {
  if (loadsDynamically(reference) && reference.specifier === undefined) {
    return couldReach({ reference, from: name, target })
      ? `${name} loads a module with a computed path`
      : undefined;
  }
  return undefined;
}

function stringPathProblem(
  project: Project,
  {
    name,
    target,
    covered,
  }: { readonly name: string; readonly target: string; readonly covered: Set<unknown> },
): string | undefined {
  const found: string[] = [];
  function visit(node: TypeScript.Node | undefined): void {
    if (node === undefined) {
      return;
    }
    if (ts.isStringLiteral(node) && !covered.has(node) && /^\.{1,2}\//u.test(node.text)) {
      found.push(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(project.sourceFile(name));
  return found.some((text) => project.resolve(text, name) === target)
    ? `${name} names the module in a string`
    : undefined;
}

function hiddenImporterProblem(project: Project, target: string): string | undefined {
  return templateImporterProblem(project.projectRoot, target);
}

export function fileReferenceProblem(project: Project, target: string): string | undefined {
  const outside =
    packageEntryProblem(project.projectRoot, target) ?? hiddenImporterProblem(project, target);
  if (outside !== undefined) {
    return outside;
  }
  for (const name of project.names) {
    const references = moduleReferences(project.sourceFile(name));
    const covered = new Set(references.map(({ literal }) => literal));
    const problem =
      references
        .map((reference) => referenceProblem({ name, reference, target }))
        .find((found) => found !== undefined) ??
      stringPathProblem(project, { name, target, covered });
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
}

function namespaceProblem(
  project: Project,
  {
    name,
    exportName,
    namespaces,
  }: { readonly name: string; readonly exportName: string; readonly namespaces: Set<string> },
): string | undefined {
  const found: boolean[] = [];
  function visit(node: TypeScript.Node | undefined): void {
    if (node === undefined) {
      return;
    }
    const isKeyed =
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      namespaces.has(node.expression.text);
    if (isKeyed) {
      const key = node.argumentExpression;
      found.push(!ts.isStringLiteralLike(key) || key.text === exportName);
    }
    ts.forEachChild(node, visit);
  }
  visit(project.sourceFile(name));
  return found.includes(true) ? `${name} reads the export by a string key` : undefined;
}

function namespaceNameOf(
  project: Project,
  { name, target, reference }: { name: string; target: string; reference: ModuleReference },
): string | undefined {
  const { kind, node, specifier } = reference;
  const bindings = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : undefined;
  return kind === 'import' &&
    bindings !== undefined &&
    ts.isNamespaceImport(bindings) &&
    project.resolve(specifier ?? '', name) === target
    ? bindings.name.text
    : undefined;
}

function namespacesOf(
  project: Project,
  {
    sourceFile,
    name,
    target,
  }: { sourceFile: TypeScript.SourceFile | undefined; name: string; target: string },
): Set<string> {
  return new Set(
    moduleReferences(sourceFile)
      .map((reference) => namespaceNameOf(project, { name, target, reference }))
      .filter((found) => found !== undefined),
  );
}

function loadProblem(
  project: Project,
  {
    name,
    references,
    target,
  }: { readonly name: string; readonly references: ModuleReference[]; readonly target: string },
): string | undefined {
  const loads = references.find(
    (reference) =>
      (loadsDynamically(reference) || reference.kind === 'type-import') &&
      (reference.specifier === undefined
        ? couldReach({ reference, from: name, target })
        : project.resolve(reference.specifier, name) === target),
  );
  if (loads !== undefined) {
    return `${name} loads the module in a way that names its exports at run time`;
  }
  const covered = new Set(references.map(({ literal }) => literal));
  return stringPathProblem(project, { name, target, covered }) === undefined
    ? undefined
    : `${name} names the module in a string`;
}

export function symbolReferenceProblem(
  project: Project,
  { target, exportName }: { readonly target: string; readonly exportName: string },
): string | undefined {
  const hidden = hiddenImporterProblem(project, target);
  if (hidden !== undefined) {
    return hidden;
  }
  for (const name of project.names) {
    const sourceFile = project.sourceFile(name);
    const references = moduleReferences(sourceFile);
    const loading = loadProblem(project, { name, references, target });
    if (loading !== undefined) {
      return loading;
    }
    const namespaces = namespacesOf(project, { sourceFile, name, target });
    const keyed =
      namespaces.size === 0
        ? undefined
        : namespaceProblem(project, { name, exportName, namespaces });
    if (keyed !== undefined) {
      return keyed;
    }
  }
  return undefined;
}

export function exportsName(project: Project, name: string, symbolName: string): boolean {
  const checker = project.program.getTypeChecker();
  const file = project.sourceFile(name);
  const moduleSymbol = file === undefined ? undefined : checker.getSymbolAtLocation(file);
  return (
    moduleSymbol !== undefined &&
    checker.getExportsOfModule(moduleSymbol).some((symbol) => symbol.name === symbolName)
  );
}
