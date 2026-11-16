import { createRequire } from 'node:module';
import { fieldOf } from '../../../../shared/values/readers.mts';
import type {
  AstNode,
  Comment,
  DeletionFix,
  PlanContext,
  Program,
  SourceCode,
} from './typed/doc-comment-types.mts';
import {
  deletionFix,
  docCommentContentReports,
  isCovered,
  publicApiNode,
} from './typed/doc-comment-views.mts';

const require = createRequire(import.meta.url);

const RULE = { tool: 'eslint', rule: 'nitpicker/no-comments' };
const TYPESCRIPT_FILE = /\.(?:[cm]?ts|tsx)$/u;
type Parser = {
  readonly parseForESLint: (text: string, options: object) => { readonly ast: Program };
};

function isParser(value: unknown): value is Parser {
  return typeof fieldOf(value, 'parseForESLint') === 'function';
}

function isAstNode(value: unknown): value is AstNode {
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

function childrenOf(node: AstNode) {
  return Object.entries(node)
    .filter(([key]) => !SKIPPED_KEYS.has(key))
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter(isAstNode);
}

function chainAt(program: Program, index: number) {
  const chain: AstNode[] = [program];
  for (const level of chain) {
    const next = childrenOf(level).find(({ range }) => range[0] <= index && index < range[1]);
    if (next !== undefined) {
      next.parent = level;
      chain.push(next);
    }
  }
  return chain;
}

function sourceCodeFor(program: Program): SourceCode {
  return {
    getTokenAfter: (comment: Comment) =>
      program.tokens.find(({ range }) => range[0] >= comment.range[1]),
    getNodeByRangeIndex: (index: number) => chainAt(program, index).at(-1),
    getAncestors: (node: AstNode) => chainAt(program, node.range[0]).slice(0, -1),
  };
}

function parsed(name: string, text: string): Program | { readonly failure: unknown } {
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

function restatingComments(program: Program): Comment[] {
  const sourceCode = sourceCodeFor(program);
  return program.comments
    .filter((comment) => comment.type === 'Block' && comment.value.startsWith('*'))
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
