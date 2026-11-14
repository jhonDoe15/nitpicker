import path from 'node:path';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { moduleReferences } from '../model/module-references.mjs';
import { packageEntryProblem, templateImporterProblem } from './hidden-importers.mjs';

function couldReach({ reference, from, target }) {
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

function loadsDynamically(reference) {
  return reference.kind === 'dynamic' || reference.kind === 'require';
}

function referenceProblem({ name, reference, target }) {
  if (loadsDynamically(reference) && reference.specifier === undefined) {
    return couldReach({ reference, from: name, target })
      ? `${name} loads a module with a computed path`
      : undefined;
  }
  return undefined;
}

function stringPathProblem(project, { name, target, covered }) {
  const found = [];
  function visit(node) {
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

function hiddenImporterProblem(project, target) {
  return templateImporterProblem(project.projectRoot, target);
}

export function fileReferenceProblem(project, target) {
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

function namespaceProblem(project, { name, exportName, namespaces }) {
  const found = [];
  function visit(node) {
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

function namespacesOf(project, { sourceFile, name, target }) {
  return new Set(
    moduleReferences(sourceFile)
      .filter(
        ({ kind, node, specifier }) =>
          kind === 'import' &&
          node.importClause?.namedBindings !== undefined &&
          ts.isNamespaceImport(node.importClause.namedBindings) &&
          project.resolve(specifier, name) === target,
      )
      .map(({ node }) => node.importClause.namedBindings.name.text),
  );
}

function loadProblem(project, { name, references, target }) {
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

export function symbolReferenceProblem(project, { target, exportName }) {
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

export function exportsName(project, name, symbolName) {
  const checker = project.program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(project.sourceFile(name));
  return (
    moduleSymbol !== undefined &&
    checker.getExportsOfModule(moduleSymbol).some((symbol) => symbol.name === symbolName)
  );
}
