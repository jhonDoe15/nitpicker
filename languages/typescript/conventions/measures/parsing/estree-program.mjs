import { createRequire } from 'node:module';
import { childrenOf } from '../../../preset/eslint-plugin/rules/analysis/node/estree-children.mjs';

const load = createRequire(import.meta.url);

export function parseProgram(text, file) {
  try {
    const { ast, visitorKeys } = load('typescript-eslint').parser.parseForESLint(text, {
      sourceType: 'module',
      range: true,
      filePath: file,
    });
    return { ast, visitorKeys };
  } catch {
    return { kind: 'unparsable' };
  }
}

export function withParents({ ast, visitorKeys }) {
  const nodes = [ast];
  for (const node of nodes) {
    for (const child of childrenOf(node, visitorKeys)) {
      child.parent = node;
      nodes.push(child);
    }
  }
  return nodes;
}
