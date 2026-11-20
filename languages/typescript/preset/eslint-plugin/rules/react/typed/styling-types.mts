import type { TSESTree } from '@typescript-eslint/utils';

export type Kind = 'inlineStyle' | 'stylesheet' | 'cssInJs';
export type ApproachName = 'class-names' | 'css-in-js' | 'inline-style' | 'style-sheet';
export type Approach = {
  readonly allowed: string;
  readonly form?: string;
  readonly banned: Readonly<Partial<Record<Kind, true>>>;
  readonly inlineMessage?: 'inlineStyleSheet';
};
export type MessageIds = 'inlineStyle' | 'inlineStyleSheet' | 'otherApproach';
export type Options = [{ readonly approach: ApproachName }];
export type Lookup = { readonly expression: TSESTree.Node; readonly keys: readonly string[] };
