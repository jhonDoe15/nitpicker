import type { JSONSchema, TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  castTags as untypedCastTags,
  isJsdocBlock as untypedIsJsdocBlock,
  jsdocOptionSchema as untypedJsdocOptionSchema,
  parseJsdoc as untypedParseJsdoc,
  triStateBooleanTags as untypedTriStateBooleanTags,
  typePredicateTags as untypedTypePredicateTags,
  unknownMemberTags as untypedUnknownMemberTags,
  withJsdoc as untypedWithJsdoc,
} from '../../../../../javascript/preset/documentation/jsdoc.mjs';

export type JsdocTag = {
  readonly tag: string;
  readonly type?: string;
  readonly name?: string;
};

export type JsdocProblem = { readonly messageId: string };

export type ParsedJsdoc = { readonly tags: JsdocTag[]; readonly problems: JsdocProblem[] };

export type JsdocOptions = readonly [Readonly<Record<string, unknown>>?];

export type TagSelector = (tags: readonly JsdocTag[]) => readonly JsdocTag[];

export type JsdocReport = {
  readonly selectTags: TagSelector;
  readonly messageId: string;
  readonly data: Readonly<Record<string, string>> | undefined;
};

function isSchemaList(value: unknown): value is JSONSchema.JSONSchema4[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'object');
}

function schemaList(value: unknown): JSONSchema.JSONSchema4[] {
  if (!isSchemaList(value)) {
    throw new TypeError('The JSDoc option schema is not a schema list.');
  }
  return value;
}

export const jsdocOptionSchema = schemaList(untypedJsdocOptionSchema);

export const isJsdocBlock: (comment: TSESTree.Comment) => boolean = untypedIsJsdocBlock;

export const parseJsdoc: (commentValue: string) => ParsedJsdoc = untypedParseJsdoc;

export const castTags: TagSelector = untypedCastTags;

export const unknownMemberTags: TagSelector = untypedUnknownMemberTags;

export const typePredicateTags: TagSelector = untypedTypePredicateTags;

export const triStateBooleanTags: TagSelector = untypedTriStateBooleanTags;

export const withJsdoc: <MessageIds extends string>(
  context: Readonly<TSESLint.RuleContext<MessageIds, JsdocOptions>>,
  visitors: TSESLint.RuleListener,
  report: JsdocReport,
) => TSESLint.RuleListener = untypedWithJsdoc;
