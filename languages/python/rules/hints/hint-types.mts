import type { Libraries } from '../libraries/typed/library-types.mts';

export type HintData = Readonly<Record<string, string | number>>;

export type RuleHint = {
  readonly tool: string;
  readonly rules?: readonly string[] | undefined;
  readonly prefix?: true;
  readonly allowed?:
    string | ((subject: string, libraries: Libraries, path: string) => string | undefined);
  readonly allowedFor?: (data: HintData) => string;
  readonly describe?: (subject: string, libraries: Libraries, data: HintData) => string;
  readonly referenceData?: HintData;
  readonly exception?: false | 'top-level';
};
