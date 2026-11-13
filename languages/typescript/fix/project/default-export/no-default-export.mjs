import path from 'node:path';
import { frameworkConventions } from '../../../preset/eslint-config/scope-support.mjs';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { defaultExportSelectors } from '../../../preset/eslint-config/strict/strict-declarations.mjs';
import { symbolReferenceProblem } from '../edits/declines.mjs';
import { declined, replaceEdit } from '../edits/text-edits.mjs';
import { verifyEdits } from '../edits/verify-edits.mjs';
import { inCasing } from '../model/names.mjs';
import { productionScope } from '../model/project-model.mjs';
import { lintRecipe } from '../plan/lint-recipe.mjs';
import { importerEdits } from './importer-edits.mjs';

function hasModifier(node, kind) {
  return (ts.getModifiers(node) ?? []).find((modifier) => modifier.kind === kind);
}

function defaultExportOf(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && statement.isExportEquals !== true) {
      return { kind: 'assignment', node: statement };
    }
    if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword) !== undefined) {
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

function derivedName(name, sourceFile, casing) {
  const parsed = path.posix.parse(name);
  const base = parsed.name.split('.')[0];
  const stem = base === 'index' ? path.posix.basename(parsed.dir) : base;
  const derived = inCasing(stem, casing);
  const usable =
    derived !== undefined &&
    ts.isIdentifierText(derived, ts.ScriptTarget.Latest) &&
    ts.stringToToken(derived) === undefined &&
    !new RegExp(String.raw`\b${derived}\b`, 'u').test(sourceFile.text);
  return usable ? derived : undefined;
}

function namedDeclaration(name, sourceFile, node) {
  const modifier = hasModifier(node, ts.SyntaxKind.DefaultKeyword);
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
  const at = node.asteriskToken === undefined ? keyword.end : node.asteriskToken.end;
  const spaced = sourceFile.text[at] === ' ' && !isClass ? 1 : 0;
  return exportName === undefined
    ? undefined
    : { exportName, edits: [removal, replaceEdit(name, [at, at + spaced], ` ${exportName}`)] };
}

function assignment(name, sourceFile, node) {
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

function definitionPlan(name, sourceFile, found) {
  if (found.kind === 'declaration') {
    return namedDeclaration(name, sourceFile, found.node);
  }
  if (found.kind === 'assignment') {
    return assignment(name, sourceFile, found.node);
  }
  const { node, statement } = found;
  if (statement.moduleSpecifier !== undefined || node.propertyName === undefined) {
    return undefined;
  }
  return {
    exportName: node.propertyName.text,
    edits: [replaceEdit(name, [node.getStart(), node.end], node.propertyName.text)],
  };
}

function planMessage({ context, project, name }) {
  const found = defaultExportOf(project.sourceFile(name));
  if (found === undefined) {
    return undefined;
  }
  const definition = definitionPlan(name, project.sourceFile(name), found);
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
