import {
  deletionFix as untypedDeletionFix,
  isCovered as untypedIsCovered,
} from '../../../../../shared/fix/recipes/doc-comments/restating-comment.mts';
import type { DeletionFix, Finding, PlanInputs } from './doc-comment-types.mts';

export {
  docCommentContentReports,
  publicApiNode,
} from '../../../preset/eslint-plugin/rules/modules/doc-comment-content.mts';

export const deletionFix: (input: {
  readonly finding: Finding;
  readonly path: string;
  readonly text: string;
  readonly span: { readonly start: number; readonly end: number };
}) => DeletionFix[] = untypedDeletionFix;

export const isCovered: (inputs: PlanInputs, name: string) => boolean = untypedIsCovered;
