import type TypeScript from 'typescript';
import { typescriptApi } from '../../../../adapters/typed/typescript-program.mts';
import { importEntries } from '../syntax/import-entries.mts';
import { depthFirst, syntaxChildren } from '../../typed/analysis-views.mts';
import type { TreeNode } from './typed/tree-types.mts';

const ts = typescriptApi();

function patternChildren(name: TypeScript.BindingName): TypeScript.BindingName[] {
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    const elements: readonly TypeScript.Node[] = name.elements;
    return elements.filter(ts.isBindingElement).map((element) => element.name);
  }
  return [];
}

function identifiersOf(name: TypeScript.BindingName | undefined): string[] {
  return name === undefined
    ? []
    : [...depthFirst(name, patternChildren)].filter(ts.isIdentifier).map(({ text }) => text);
}

function declaredBy(node: TypeScript.Node, root: TypeScript.Node): string[] {
  if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
    return identifiersOf(node.name);
  }
  const named =
    node !== root &&
    (ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isFunctionExpression(node));
  return named ? identifiersOf(node.name) : [];
}

export function boundNames(root: TypeScript.Node): Set<string> {
  return new Set([...depthFirst(root, syntaxChildren)].flatMap((node) => declaredBy(node, root)));
}

export function importedNames(
  sourceFile: TypeScript.SourceFile,
  moduleOf: (specifier: string) => string,
): Map<string, string> {
  const imported = new Map<string, string>();
  for (const { specifier, local, imported: name } of importEntries(sourceFile)) {
    imported.set(local, `${moduleOf(specifier)}#${name}`);
  }
  return imported;
}

export function nameNode(
  text: string,
  {
    bound,
    imported,
  }: { readonly bound: ReadonlySet<string>; readonly imported: ReadonlyMap<string, string> },
): TreeNode {
  return bound.has(text)
    ? { kind: 'name', children: [], binding: 'bound', value: text, text }
    : { kind: 'name', children: [], binding: 'free', value: imported.get(text) ?? text, text };
}
