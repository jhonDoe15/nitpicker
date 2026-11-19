import { javaDocCommentEntries } from '../../adapters/doc-comments/java-doc-comments.mts';
import { kotlinDocCommentEntries } from '../../adapters/doc-comments/kotlin-doc-comments.mts';
import {
  DOC_COMMENT_RULE,
  deletionFix as untypedDeletionFix,
  isCovered as untypedIsCovered,
  restatesItsName as untypedRestatesItsName,
} from '../../../../shared/fix/recipes/doc-comments/restating-comment.mjs';
import type { FixRecipe, RecipeFix, RuleRef } from '../../../../core/fix/typed/fix-types.mts';
import { recipeFixesOf } from '../../../../core/fix/typed/recipe-fixes.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, listOf } from '../../../../shared/values/readers.mts';

type Restating = {
  readonly id: string;
  readonly preset: string;
  readonly extensions: readonly string[];
};
type Deletion = {
  readonly finding: RecipeFix['finding'];
  readonly path: string;
  readonly text: string;
  readonly span: unknown;
};

const JAVA_EXTENSION = '.java';
const RULE: RuleRef = { tool: 'facts', rule: DOC_COMMENT_RULE };
const ENTRIES: ReadonlyMap<string, unknown> = new Map<string, unknown>([
  [JAVA_EXTENSION, javaDocCommentEntries],
  ['.kt', kotlinDocCommentEntries],
]);
const isCovered: (inputs: unknown, name: string) => boolean = untypedIsCovered;
const restatesItsName: (comment: unknown) => boolean = untypedRestatesItsName;
const NON_MAIN_SET = /(?:^|\/)src\/(?!main\/)[^/]+\/(?:java|kotlin)\/|(?:^|\/)tests?\//u;

function extensionOf(name: string): string {
  return name.slice(name.lastIndexOf('.'));
}

function deletionFixOf(deletion: Deletion): RecipeFix[] {
  return recipeFixesOf(callUntyped(untypedDeletionFix, deletion));
}

function entriesOf(name: string, text: string): readonly unknown[] {
  return listOf(callUntyped(ENTRIES.get(extensionOf(name)), text));
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
              .filter((entry) => restatesItsName(fieldOf(entry, 'comment')))
              .flatMap((entry) =>
                deletionFixOf({
                  finding: {
                    ...RULE,
                    path: name,
                    line: Number(fieldOf(fieldOf(entry, 'comment'), 'line')),
                  },
                  path: name,
                  text,
                  span: fieldOf(entry, 'span'),
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
