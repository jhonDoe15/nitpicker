import type { Parsed } from '../../reuse/jvm-reuse-types.mts';
import type { SourceProject } from '../review-types.mts';

export type Literal =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number };

export type JvmSource = {
  readonly file: string;
  readonly kotlin: boolean;
  readonly parsed: Parsed;
};

export type Constant = {
  readonly name: string;
  readonly owner: string | undefined;
  readonly packageName: string;
  readonly file: string;
  readonly value: Literal;
};

export type MentionedConstant = Constant & { readonly mentions: string[] };

export type TestLiteral = {
  readonly value: Literal;
  readonly line: number;
  readonly names: () => Set<string>;
};

export type ConstantProject = SourceProject;

export type ConstantPolicy = { readonly exclude?: readonly string[] };
