import { createRequire } from 'node:module';
import {
  docCommentContentReports,
  publicApiNode,
} from '../../preset/eslint-plugin/rules/modules/doc-comment-content.mjs';
import {
  deletionFix,
  isCovered,
} from '../../../../shared/fix/recipes/doc-comments/restating-comment.mjs';

const require = createRequire(import.meta.url);

const RULE = { tool: 'eslint', rule: 'nitpicker/no-comments' };
const TYPESCRIPT_FILE = /\.(?:[cm]?ts|tsx)$/u;
const SKIPPED_KEYS = new Set(['parent', 'tokens', 'comments', 'loc', 'range']);

function childrenOf(node) {
  return Object.entries(node)
    .filter(([key]) => !SKIPPED_KEYS.has(key))
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter((value) => typeof value?.type === 'string' && Array.isArray(value.range));
}

function chainAt(program, index) {
  const chain = [program];
  for (const level of chain) {
    const next = childrenOf(level).find(({ range }) => range[0] <= index && index < range[1]);
    if (next !== undefined) {
      next.parent = level;
      chain.push(next);
    }
  }
  return chain;
}

function sourceCodeFor(program) {
  return {
    getTokenAfter: (comment) => program.tokens.find(({ range }) => range[0] >= comment.range[1]),
    getNodeByRangeIndex: (index) => chainAt(program, index).at(-1),
    getAncestors: (node) => chainAt(program, node.range[0]).slice(0, -1),
  };
}

function parsed(name, text) {
  try {
    return require('typescript-eslint').parser.parseForESLint(text, {
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

function restatingComments(program) {
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

function fixesOf(name, text) {
  const program = parsed(name, text);
  return (program.failure === undefined ? restatingComments(program) : []).flatMap((comment) =>
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
  plan({ files, inputs }) {
    return {
      fixes: files
        .filter(({ path: name }) => TYPESCRIPT_FILE.test(name) && isCovered(inputs, name))
        .flatMap(({ path: name, text }) => fixesOf(name, text)),
    };
  },
};
