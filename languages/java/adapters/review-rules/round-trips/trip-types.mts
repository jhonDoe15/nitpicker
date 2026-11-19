import type { Member, MemberInfo } from '../../reuse/source/jvm-source-types.mts';
import type { SourceProject } from '../review-types.mts';

export type TripFunction = {
  readonly name: string;
  readonly line: number;
  readonly isStatic: boolean;
};

export type TripPair = {
  readonly earlier: TripFunction;
  readonly later: TripFunction;
  readonly inner: TripFunction;
  readonly outer: TripFunction;
  readonly owner?: string | undefined;
};

type NamedInfo = MemberInfo & { readonly name: string };

export type MemberEntry = { readonly member: Member; readonly info: NamedInfo };

export type FunctionContext = {
  readonly language: 'java' | 'kotlin';
  readonly ownerKind?: string | undefined;
  readonly statics: boolean;
};

export type TripSource = { readonly file: string; readonly kotlin: boolean; readonly text: string };

export type TripProject = SourceProject;

export type TripOptions = {
  readonly projects: readonly TripProject[];
  readonly kotlin: boolean;
  readonly exclude: readonly string[];
  readonly test: boolean;
};
