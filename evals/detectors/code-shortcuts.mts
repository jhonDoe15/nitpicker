import path from 'node:path';
import type { Occurrence, Shortcut, Tree, TreeLike } from './common/types.mts';
import { normalizeModule, resolveSpecifier } from './modules/module-references.mts';
import {
  type Add,
  collectIgnoredErrors,
  collectNonPreferred,
  collectTypeEscapes,
} from './syntax/syntax-escapes.mts';
import { toTree } from './tree.mts';
import {
  isSourcePath,
  isTestPath,
  lineOf,
  type Node,
  parseSource,
  type SourceFile,
  ts,
} from './typescript.mts';

export const CODE_SHORTCUTS = 'code-shortcuts';

export const DEFAULT_FEATURES_ROOT = 'src/main/features';

const SHARED_ENTRY_ROOT = 'src';

export function detectCodeShortcuts({
  fixture,
  final,
  featuresRoot = DEFAULT_FEATURES_ROOT,
}: {
  fixture: TreeLike;
  final: TreeLike;
  featuresRoot?: string | undefined;
}): Shortcut[] {
  const fixtureTree = toTree(fixture);
  const finalTree = toTree(final);
  const shortcuts: Shortcut[] = [];
  for (const [file, text] of finalTree) {
    if (!isSourcePath(file) || fixtureTree.get(file) === text) {
      continue;
    }
    const fixtureText = fixtureTree.get(file);
    const before = fixtureText === undefined ? [] : occurrencesIn(file, fixtureText, featuresRoot);
    const after = occurrencesIn(file, text, featuresRoot);
    shortcuts.push(...newOccurrences(file, before, after));
    if (fixtureText !== undefined) {
      shortcuts.push(...sharedEntryBranches(file, before, after, featuresRoot));
    }
  }
  return shortcuts;
}

function newOccurrences(
  file: string,
  before: readonly Occurrence[],
  after: readonly Occurrence[],
): Shortcut[] {
  const known = new Map<string, number>();
  for (const occurrence of before) {
    known.set(occurrence.key, (known.get(occurrence.key) ?? 0) + 1);
  }
  const shortcuts: Shortcut[] = [];
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

function sharedEntryBranches(
  file: string,
  before: readonly Occurrence[],
  after: readonly Occurrence[],
  featuresRoot: string,
): Shortcut[] {
  if (isTestPath(file) || !isSharedEntry(file, featuresRoot)) {
    return [];
  }
  function countBranches(occurrences: readonly Occurrence[]): number {
    return occurrences.filter((occurrence) => occurrence.kind === 'branch').length;
  }
  const added = countBranches(after) - countBranches(before);
  const firstNew = after.filter((occurrence) => occurrence.kind === 'branch').at(-1);
  if (added <= 0 || firstNew === undefined) {
    return [];
  }
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

function isSharedEntry(file: string, featuresRoot: string): boolean {
  return file.startsWith(`${SHARED_ENTRY_ROOT}/`) && !file.startsWith(`${featuresRoot}/`);
}

function occurrencesIn(file: string, text: string, featuresRoot: string): Occurrence[] {
  const sourceFile = parseSource(file, text);
  const occurrences: Occurrence[] = [];
  function add(kind: string, node: Node, signature: string, detail: string) {
    occurrences.push({
      kind,
      key: `${kind}|${signature}`,
      line: lineOf(sourceFile, node),
      detail,
    });
  }

  function visit(node: Node): void {
    collectTypeEscapes(node, sourceFile, add);
    collectNonPreferred(node, add);
    collectIgnoredErrors(node, add);
    collectImports({ node, file, featuresRoot, add });
    if (isBranch(node)) {
      add('branch', node, 'branch', 'branch');
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return occurrences;
}

function isBranch(node: Node): boolean {
  return ts.isIfStatement(node) || ts.isCaseClause(node) || ts.isConditionalExpression(node);
}

function collectImports({
  node,
  file,
  featuresRoot,
  add,
}: {
  node: Node;
  file: string;
  featuresRoot: string;
  add: Add;
}): void {
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

function moduleSpecifierOf(node: Node): string | undefined {
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

function featureOf(
  modulePath: string,
  featuresRoot: string,
): { name: string; rest: string } | undefined {
  const prefix = `${featuresRoot}/`;
  if (!modulePath.startsWith(prefix)) {
    return undefined;
  }
  const [name, ...rest] = modulePath.slice(prefix.length).split(path.posix.sep);
  return name === undefined ? undefined : { name, rest: rest.join('/') };
}
