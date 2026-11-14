import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { fileImports } from '../../../syntax/module-facts.mjs';
import { syntaxChildren } from '../../../syntax/children.mjs';

const NAMED_INSIDE = [ts.isFunctionDeclaration, ts.isClassDeclaration, ts.isFunctionExpression];

function patternChildren(name) {
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    return name.elements.filter(ts.isBindingElement).map((element) => element.name);
  }
  return [];
}

function identifiersOf(name) {
  return name === undefined
    ? []
    : [...depthFirst(name, patternChildren)].filter(ts.isIdentifier).map(({ text }) => text);
}

function declaredBy(node, root) {
  if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
    return identifiersOf(node.name);
  }
  const named = node !== root && NAMED_INSIDE.some((matches) => matches(node));
  return named ? identifiersOf(node.name) : [];
}

export function boundNames(root) {
  return new Set([...depthFirst(root, syntaxChildren)].flatMap((node) => declaredBy(node, root)));
}

export function importedNames(sourceFile, moduleOf) {
  const imported = new Map();
  for (const { specifier, defaultName, namespaceName, named } of fileImports(sourceFile)) {
    const entries = [
      ...(defaultName === undefined ? [] : [[defaultName, 'default']]),
      ...(namespaceName === undefined ? [] : [[namespaceName, '*']]),
      ...named.map(({ local, imported: name }) => [local, name]),
    ];
    for (const [local, name] of entries) {
      imported.set(local, `${moduleOf(specifier)}#${name}`);
    }
  }
  return imported;
}

export function nameNode(text, { bound, imported }) {
  return bound.has(text)
    ? { kind: 'name', children: [], binding: 'bound', value: text, text }
    : { kind: 'name', children: [], binding: 'free', value: imported.get(text) ?? text, text };
}
