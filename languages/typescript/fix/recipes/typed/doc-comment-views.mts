import {
  docCommentContentReports as untypedDocCommentContentReports,
  publicApiNode as untypedPublicApiNode,
} from '../../../preset/eslint-plugin/rules/modules/doc-comment-content.mjs';
import {
  deletionFix as untypedDeletionFix,
  isCovered as untypedIsCovered,
} from '../../../../../shared/fix/recipes/doc-comments/restating-comment.mjs';
import type {
  AstNode,
  Comment,
  DeletionFix,
  Finding,
  PlanInputs,
  SourceCode,
} from './doc-comment-types.mts';

export const docCommentContentReports: (
  comment: Comment,
  node: AstNode,
) => readonly { readonly messageId: string }[] = untypedDocCommentContentReports;

export const publicApiNode: (sourceCode: SourceCode, comment: Comment) => AstNode | undefined =
  untypedPublicApiNode;

export const deletionFix: (input: {
  readonly finding: Finding;
  readonly path: string;
  readonly text: string;
  readonly span: { readonly start: number; readonly end: number };
}) => DeletionFix[] = untypedDeletionFix;

export const isCovered: (inputs: PlanInputs, name: string) => boolean = untypedIsCovered;
