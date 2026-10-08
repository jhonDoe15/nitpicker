import path from 'node:path';
import { normalizeModule, resolveSpecifier } from './test-structure.mjs';
import { toTree } from './tree.mjs';
import { isSourcePath, isTestPath, lineOf, parseSource, ts } from './typescript.mjs';

export const CODE_SHORTCUTS = 'code-shortcuts';

export const DEFAULT_FEATURES_ROOT = 'src/main/features';

const SHARED_ENTRY_ROOT = 'src';

/**
 * Detects shortcuts in the code itself, found by syntax rather than text:
 *
 * - `type-assertion` (`x as T`, `<T>x`, but not `as const`), `any`, `non-null-assertion`.
 * - `cross-feature-import`: an import that reaches into `<featuresRoot>/<other>/...` instead of
 *   that feature's public `index`, from another feature or from outside the features directory.
 * - `shared-entry-branch`: more `if`, `case` or `?:` branches in an existing source file outside
 *   the features directory, which is where a new feature should not be wired in with a branch.
 * - `ignored-error`: a `catch` that does nothing, or a `.catch()` whose handler does nothing.
 * - `non-preferred-construct`: `forEach`, `for(;;)`, `for...in`, `while`, `do`, `.then()` chains,
 *   `enum`, `namespace` and `interface`.
 *
 * Only occurrences that are new relative to the fixture are reported. Occurrences are compared as a
 * count per file and signature (not by line), so editing or moving existing code does not trigger.
 */
export function detectCodeShortcuts({ fixture, final, featuresRoot = DEFAULT_FEATURES_ROOT }) {
  const fixtureTree = toTree(fixture);
  const finalTree = toTree(final);
  const shortcuts = [];
  for (const [file, text] of finalTree) {
    if (!isSourcePath(file) || fixtureTree.get(file) === text) {
      continue;
    }
    const before = fixtureTree.has(file)
      ? occurrencesIn(file, fixtureTree.get(file), featuresRoot)
      : [];
    const after = occurrencesIn(file, text, featuresRoot);
    shortcuts.push(...newOccurrences(file, before, after));
    if (fixtureTree.has(file)) {
      shortcuts.push(...sharedEntryBranches(file, before, after, featuresRoot));
    }
  }
  return shortcuts;
}

function newOccurrences(file, before, after) {
  const known = new Map();
  for (const occurrence of before) {
    known.set(occurrence.key, (known.get(occurrence.key) ?? 0) + 1);
  }
  const shortcuts = [];
  for (const occurrence of after) {
    if (occurrence.kind === 'branch') {
      continue;
    }
    const remaining = known.get(occurrence.key) ?? 0;
    if (remaining > 0) {
      known.set(occurrence.key, remaining - 1);
      continue;
    }
    shortcuts.push({
      category: CODE_SHORTCUTS,
      kind: occurrence.kind,
      path: file,
      line: occurrence.line,
      detail: occurrence.detail,
    });
  }
  return shortcuts;
}

function sharedEntryBranches(file, before, after, featuresRoot) {
  if (isTestPath(file) || !isSharedEntry(file, featuresRoot)) {
    return [];
  }
  const countBranches = (occurrences) =>
    occurrences.filter((occurrence) => occurrence.kind === 'branch').length;
  const added = countBranches(after) - countBranches(before);
  if (added <= 0) {
    return [];
  }
  const firstNew = after.filter((occurrence) => occurrence.kind === 'branch').at(-1);
  return [
    {
      category: CODE_SHORTCUTS,
      kind: 'shared-entry-branch',
      path: file,
      line: firstNew.line,
      detail: `${String(added)} new branch${added === 1 ? '' : 'es'} in shared file; add a feature directory instead`,
    },
  ];
}

function isSharedEntry(file, featuresRoot) {
  return file.startsWith(`${SHARED_ENTRY_ROOT}/`) && !file.startsWith(`${featuresRoot}/`);
}

function occurrencesIn(file, text, featuresRoot) {
  const sourceFile = parseSource(file, text);
  const occurrences = [];
  const add = (kind, node, signature, detail) =>
    occurrences.push({
      kind,
      key: `${kind}|${signature}`,
      line: lineOf(sourceFile, node),
      detail,
    });

  const visit = (node) => {
    collectTypeEscapes(node, sourceFile, add);
    collectNonPreferred(node, sourceFile, add);
    collectIgnoredErrors(node, sourceFile, add);
    collectImports({ node, file, featuresRoot, add });
    if (isBranch(node)) {
      add('branch', node, 'branch', 'branch');
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return occurrences;
}

function isBranch(node) {
  return ts.isIfStatement(node) || ts.isCaseClause(node) || ts.isConditionalExpression(node);
}

function collectTypeEscapes(node, sourceFile, add) {
  if (ts.isAsExpression(node) && !ts.isConstTypeReference(node.type)) {
    const type = node.type.getText(sourceFile);
    add('type-assertion', node, type, `type assertion: as ${type}`);
  } else if (ts.isTypeAssertionExpression(node) && !ts.isConstTypeReference(node.type)) {
    const type = node.type.getText(sourceFile);
    add('type-assertion', node, type, `type assertion: <${type}>`);
  } else if (node.kind === ts.SyntaxKind.AnyKeyword) {
    add('any', node, 'any', 'any type');
  } else if (ts.isNonNullExpression(node)) {
    const expression = node.expression.getText(sourceFile);
    add('non-null-assertion', node, expression, `non-null assertion: ${expression}!`);
  }
}

function collectNonPreferred(node, sourceFile, add) {
  const report = (construct) => {
    add('non-preferred-construct', node, construct, construct);
  };
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const name = node.expression.name.text;
    if (name === 'forEach') {
      report('forEach');
    } else if (name === 'then') {
      report('.then() chain');
    }
  } else if (ts.isForStatement(node)) {
    report('for(;;) loop');
  } else if (ts.isForInStatement(node)) {
    report('for...in loop');
  } else if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
    report('while loop');
  } else if (ts.isEnumDeclaration(node)) {
    report('enum');
  } else if (ts.isModuleDeclaration(node) && !ts.isStringLiteral(node.name)) {
    report('namespace');
  } else if (ts.isInterfaceDeclaration(node)) {
    report('interface');
  }
}

function collectIgnoredErrors(node, sourceFile, add) {
  if (ts.isCatchClause(node) && doesNothing(node.block.statements)) {
    add('ignored-error', node, 'catch', 'catch block ignores the error');
  } else if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'catch' &&
    node.arguments.length === 1 &&
    isNoopHandler(node.arguments[0])
  ) {
    add('ignored-error', node, '.catch', '.catch() handler ignores the error');
  }
}

function isUndefinedLike(expression) {
  return (
    expression === undefined ||
    expression.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(expression) && expression.text === 'undefined') ||
    (ts.isVoidExpression(expression) && ts.isNumericLiteral(expression.expression))
  );
}

function doesNothing(statements) {
  return statements.every(
    (statement) =>
      ts.isEmptyStatement(statement) ||
      ts.isContinueStatement(statement) ||
      ts.isBreakStatement(statement) ||
      (ts.isReturnStatement(statement) && isUndefinedLike(statement.expression)),
  );
}

function isNoopHandler(handler) {
  if (ts.isIdentifier(handler)) {
    return /^(?:noop|ignore)$/i.test(handler.text);
  }
  if (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) {
    return false;
  }
  if (ts.isBlock(handler.body)) {
    return doesNothing(handler.body.statements);
  }
  return isUndefinedLike(handler.body);
}

function collectImports({ node, file, featuresRoot, add }) {
  const specifier = moduleSpecifierOf(node);
  if (specifier === undefined || !specifier.startsWith('.')) {
    return;
  }
  const target = resolveSpecifier(file, specifier);
  const targetFeature = featureOf(target, featuresRoot);
  if (targetFeature === undefined || targetFeature.rest === '') {
    return;
  }
  const sourceFeature = featureOf(normalizeModule(file), featuresRoot);
  if (sourceFeature === undefined && isTestPath(file)) {
    return;
  }
  if (sourceFeature?.name === targetFeature.name) {
    return;
  }
  const origin =
    sourceFeature === undefined
      ? 'outside the features directory'
      : `feature ${sourceFeature.name}`;
  add(
    'cross-feature-import',
    node,
    target,
    `${origin} imports ${specifier}, internals of feature ${targetFeature.name}; import its index instead`,
  );
}

function moduleSpecifierOf(node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments[0] !== undefined &&
    ts.isStringLiteralLike(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return undefined;
}

// `src/main/features/billing/domain/x` -> { name: 'billing', rest: 'domain/x' }; the feature's own
// index (`src/main/features/billing`, after normalization) has rest ''.
function featureOf(modulePath, featuresRoot) {
  const prefix = `${featuresRoot}/`;
  if (!modulePath.startsWith(prefix)) {
    return undefined;
  }
  const [name, ...rest] = modulePath.slice(prefix.length).split(path.posix.sep);
  return { name, rest: rest.join('/') };
}
