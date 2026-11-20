import { createRequire } from 'node:module';
import { fieldOf } from '../../../../shared/values/readers.mts';
import type { TSESTree } from '@typescript-eslint/utils';
import type { DeletionFix, PlanContext } from './typed/doc-comment-types.mts';
import type { CommentSource } from '../../preset/eslint-plugin/rules/modules/doc-comment-content.mts';
import {
  deletionFix,
  docCommentContentReports,
  isCovered,
  publicApiNode,
} from './typed/doc-comment-views.mts';

const require = createRequire(import.meta.url);

const RULE = { tool: 'eslint', rule: 'nitpicker/no-comments' };
const TYPESCRIPT_FILE = /\.(?:[cm]?ts|tsx)$/u;
type ParsedProgram = TSESTree.Program & {
  readonly tokens: TSESTree.Token[];
  readonly comments: TSESTree.Comment[];
};
type Parser = {
  readonly parseForESLint: (text: string, options: object) => { readonly ast: ParsedProgram };
};

function isParser(value: unknown): value is Parser {
  return typeof fieldOf(value, 'parseForESLint') === 'function';
}

function isAstNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string' &&
    'range' in value &&
    Array.isArray(value.range)
  );
}

const SKIPPED_KEYS = new Set(['parent', 'tokens', 'comments', 'loc', 'range']);

function childrenOf(node: TSESTree.Node): TSESTree.Node[] {
  return Object.entries(node)
    .filter(([key]) => !SKIPPED_KEYS.has(key))
    .flatMap(([, value]: [string, unknown]) => {
      const values: unknown[] = Array.isArray(value) ? value : [value];
      return values;
    })
    .filter(isAstNode);
}

function chainAt(program: ParsedProgram, index: number): TSESTree.Node[] {
  const chain: TSESTree.Node[] = [program];
  for (const level of chain) {
    const next = childrenOf(level).find(({ range }) => range[0] <= index && index < range[1]);
    if (next !== undefined) {
      Reflect.set(next, 'parent', level);
      chain.push(next);
    }
  }
  return chain;
}

function sourceCodeFor(program: ParsedProgram): CommentSource {
  return {
    getTokenAfter: (comment) => program.tokens.find(({ range }) => range[0] >= comment.range[1]),
    getNodeByRangeIndex: (index) => chainAt(program, index).at(-1),
    getAncestors: (node) => chainAt(program, node.range[0]).slice(0, -1),
  };
}

function parsed(name: string, text: string): ParsedProgram | { readonly failure: unknown } {
  try {
    const loaded: unknown = require('typescript-eslint');
    const parser = fieldOf(loaded, 'parser');
    if (!isParser(parser)) {
      throw new TypeError('typescript-eslint does not export a parser');
    }
    return parser.parseForESLint(text, {
      range: true,
      loc: true,
      comment: true,
      tokens: true,
      ecmaFeatures: { jsx: name.endsWith('x') },
    }).ast;
  } catch (error) {
    return { failure: error };
  }
}

function blockKind(comment: TSESTree.Comment): boolean {
  const type: string = comment.type;
  return type === 'Block';
}

function restatingComments(program: ParsedProgram): TSESTree.Comment[] {
  const sourceCode = sourceCodeFor(program);
  return program.comments
    .filter((comment) => blockKind(comment) && comment.value.startsWith('*'))
    .flatMap((comment) => {
      const node = publicApiNode(sourceCode, comment);
      const restating =
        node !== undefined &&
        docCommentContentReports(comment, node).some(
          ({ messageId }) => messageId === 'restatingDocComment',
        );
      return restating ? [comment] : [];
    });
}

function fixesOf(name: string, text: string): DeletionFix[] {
  const program = parsed(name, text);
  return ('failure' in program ? [] : restatingComments(program)).flatMap((comment) =>
    deletionFix({
      finding: { ...RULE, path: name, line: comment.loc.start.line },
      path: name,
      text,
      span: { start: comment.range[0], end: comment.range[1] },
    }),
  );
}

export const typescriptRestatingDocCommentRecipe = {
  id: 'typescript-restating-doc-comment',
  rules: [RULE],
  presets: ['typescript'],
  scope: 'file',
  safety: 'safe',
  plan({ files, inputs }: PlanContext): { readonly fixes: DeletionFix[] } {
    return {
      fixes: files
        .filter(({ path: name }) => TYPESCRIPT_FILE.test(name) && isCovered(inputs, name))
        .flatMap(({ path: name, text }) => fixesOf(name, text)),
    };
  },
};
