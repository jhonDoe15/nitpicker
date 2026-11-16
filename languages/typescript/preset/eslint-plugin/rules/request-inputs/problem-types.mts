import type TypeScript from 'typescript';

export type Kind = 'number' | 'integer' | 'bigint' | 'boolean' | 'date';
export type Library = 'zod' | 'valibot' | 'class-validator' | 'param' | 'type';
export type Checker = TypeScript.TypeChecker | undefined;

export type Problem = {
  readonly kind: Kind;
  readonly cast?: true;
  readonly form: string;
  readonly library: Library;
  readonly fix?: string | undefined;
};

export type Finding = {
  readonly field: string;
  readonly node: TypeScript.Node;
  readonly problem: Problem;
};

export type Located = Finding & {
  readonly source: string;
  readonly binding: TypeScript.Node;
};
