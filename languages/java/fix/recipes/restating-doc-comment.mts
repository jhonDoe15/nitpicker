import { javaDocCommentEntries } from '../../adapters/doc-comments/java-doc-comments.mts';
import { kotlinDocCommentEntries } from '../../adapters/doc-comments/kotlin-doc-comments.mts';
import {
  DOC_COMMENT_RULE,
  deletionFix,
  isCovered as untypedIsCovered,
  restatesItsName,
} from '../../../../shared/fix/recipes/doc-comments/restating-comment.mts';
import type { FixRecipe, RuleRef } from '../../../../core/fix/typed/fix-types.mts';
import type { DocEntry } from '../../adapters/doc-comments/doc-comment-types.mts';

type Restating = {
  readonly id: string;
  readonly preset: string;
  readonly extensions: readonly string[];
};

const JAVA_EXTENSION = '.java';
const RULE: RuleRef = { tool: 'facts', rule: DOC_COMMENT_RULE };
const ENTRIES: ReadonlyMap<string, (source: string) => DocEntry[]> = new Map([
  [JAVA_EXTENSION, javaDocCommentEntries],
  ['.kt', kotlinDocCommentEntries],
]);
const isCovered: (inputs: unknown, name: string) => boolean = untypedIsCovered;
const NON_MAIN_SET = /(?:^|\/)src\/(?!main\/)[^/]+\/(?:java|kotlin)\/|(?:^|\/)tests?\//u;

function extensionOf(name: string): string {
  return name.slice(name.lastIndexOf('.'));
}

function entriesOf(name: string, text: string): readonly DocEntry[] {
  return ENTRIES.get(extensionOf(name))?.(text) ?? [];
}

function restatingRecipe({ id, preset, extensions }: Restating): FixRecipe {
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
            entriesOf(name, text)
              .filter(({ comment }) => restatesItsName(comment))
              .flatMap(({ comment, span }) =>
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
  extensions: [JAVA_EXTENSION],
});

export const kotlinRestatingDocCommentRecipe = restatingRecipe({
  id: 'kotlin-restating-doc-comment',
  preset: 'kotlin',
  extensions: [JAVA_EXTENSION, '.kt'],
});
