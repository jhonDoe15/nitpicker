import { javaDocCommentEntries } from '../../adapters/doc-comments/java-doc-comments.mjs';
import { kotlinDocCommentEntries } from '../../adapters/doc-comments/kotlin-doc-comments.mjs';
import {
  DOC_COMMENT_RULE,
  deletionFix,
  isCovered,
  restatesItsName,
} from '../../../../shared/fix/recipes/doc-comments/restating-comment.mjs';

const RULE = { tool: 'facts', rule: DOC_COMMENT_RULE };
const ENTRIES = { '.java': javaDocCommentEntries, '.kt': kotlinDocCommentEntries };
const NON_MAIN_SET = /(?:^|\/)src\/(?!main\/)[^/]+\/(?:java|kotlin)\/|(?:^|\/)tests?\//u;

function extensionOf(name) {
  return name.slice(name.lastIndexOf('.'));
}

function restatingRecipe({ id, preset, extensions }) {
  return {
    id,
    rules: [RULE],
    presets: [preset],
    scope: 'file',
    safety: 'safe',
    plan({ files, inputs }) {
      return {
        fixes: files
          .filter(
            ({ path: name }) =>
              extensions.includes(extensionOf(name)) &&
              !NON_MAIN_SET.test(name) &&
              isCovered(inputs, name),
          )
          .flatMap(({ path: name, text }) =>
            ENTRIES[extensionOf(name)](text)
              .filter(({ comment }) => restatesItsName(comment))
              .flatMap(({ span, comment }) =>
                deletionFix({
                  finding: { ...RULE, path: name, line: comment.line },
                  path: name,
                  text,
                  span,
                }),
              ),
          ),
      };
    },
  };
}

export const javaRestatingDocCommentRecipe = restatingRecipe({
  id: 'java-restating-doc-comment',
  preset: 'java',
  extensions: ['.java'],
});

export const kotlinRestatingDocCommentRecipe = restatingRecipe({
  id: 'kotlin-restating-doc-comment',
  preset: 'kotlin',
  extensions: ['.java', '.kt'],
});
