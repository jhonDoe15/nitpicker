import type { ImportEntry, Token } from '../jvm-reuse-types.mts';

export type Range = { readonly from: number; readonly to: number };

export type Member = { readonly start: number; readonly end: number };

export type MemberInfo = {
  readonly modifiers: Set<string>;
  readonly kind: string | undefined;
  readonly name: string | undefined;
  readonly type?: true;
  readonly keyword?: string | undefined;
  readonly paren?: number;
  readonly from?: number;
};

export type Header = { packageName: string; imports: ImportEntry[]; end: number };

export type Structure = {
  readonly tokens: readonly Token[];
  readonly close: Int32Array;
  readonly header: Header;
};

export type DefinitionStructure = Structure & {
  readonly memberNames: Set<string>;
  readonly nested: boolean;
};

export type LanguageRules = {
  readonly members: (tokens: readonly Token[], close: Int32Array, range: Range) => Member[];
  readonly member: (
    tokens: readonly Token[],
    close: Int32Array,
    member: Member,
  ) => MemberInfo | undefined;
};

export type FoundMember = MemberInfo & {
  readonly name: string;
  readonly member: Member;
  readonly owner?: string | undefined;
  readonly supertypes?: string | undefined;
};

export type Language = 'java' | 'kotlin';

export type TypeEntry = { readonly info: FoundMember; readonly name: string };
