import { createRequire } from 'node:module';
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { fieldOf, isPlainObject } from '../../../../../shared/values/readers.mts';
import { childrenOf } from '../../../preset/eslint-plugin/rules/loops/loop-shapes.mts';
import { isNode, type VisitorKeys } from '../../../preset/eslint-plugin/rules/typed/node-views.mts';

export type ParsedProgram = { readonly ast: TSESTree.Program; readonly visitorKeys: VisitorKeys };
export type UnparsableProgram = {
  readonly kind: 'unparsable';
  readonly ast?: undefined;
  readonly visitorKeys?: undefined;
};
export type ProgramResult = ParsedProgram | UnparsableProgram;

type Parser = {
  readonly parseForESLint: (text: string, options: object) => unknown;
};

const load = createRequire(import.meta.url);

function isParser(value: unknown): value is Parser {
  return typeof fieldOf(value, 'parseForESLint') === 'function';
}

function isVisitorKeys(value: unknown): value is VisitorKeys {
  return isPlainObject(value);
}

function isProgram(value: unknown): value is TSESTree.Program {
  return isNode(value) && value.type === AST_NODE_TYPES.Program;
}

export function parseProgram(text: string, file: string): ProgramResult {
  try {
    const loaded: unknown = load('typescript-eslint');
    const parser = fieldOf(loaded, 'parser');
    if (!isParser(parser)) {
      throw new TypeError('typescript-eslint does not export a parser');
    }
    const parsed = parser.parseForESLint(text, {
      sourceType: 'module',
      range: true,
      filePath: file,
    });
    const ast = fieldOf(parsed, 'ast');
    const visitorKeys = fieldOf(parsed, 'visitorKeys');
    if (!isProgram(ast) || !isVisitorKeys(visitorKeys)) {
      throw new TypeError('the parser returned no program');
    }
    return { ast, visitorKeys };
  } catch {
    return { kind: 'unparsable' };
  }
}

export function withParents({ ast, visitorKeys }: ParsedProgram): TSESTree.Node[] {
  const nodes: TSESTree.Node[] = [ast];
  for (const node of nodes) {
    for (const child of childrenOf(node, visitorKeys)) {
      Reflect.set(child, 'parent', node);
      nodes.push(child);
    }
  }
  return nodes;
}
