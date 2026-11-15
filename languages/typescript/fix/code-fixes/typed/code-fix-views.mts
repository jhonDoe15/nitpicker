import type TypeScript from 'typescript';
import {
  acceptsAction as untypedAcceptsAction,
  candidateFiles as untypedCandidateFiles,
  codeFixes as untypedCodeFixes,
  codeName as untypedCodeName,
  fixesForCode as untypedFixesForCode,
  selectedCodeFixes as untypedSelectedCodeFixes,
} from '../code-fix-rules.mjs';

export type CodeFix = {
  readonly id: string;
  readonly safety: string;
  readonly codes: readonly number[];
  readonly fixName: string;
  readonly description?: RegExp;
  readonly needs?: RegExp;
};

export type SourceText = { readonly name: string; readonly text: string };

export const codeName: (code: number) => string = untypedCodeName;

export const selectedCodeFixes: (selectedRules: readonly string[]) => readonly CodeFix[] =
  untypedSelectedCodeFixes;

export const candidateFiles: (
  fixes: readonly CodeFix[],
  files: readonly SourceText[],
) => SourceText[] = untypedCandidateFiles;

export const fixesForCode: (fixes: readonly CodeFix[], code: number) => CodeFix[] =
  untypedFixesForCode;

export const acceptsAction: (fix: CodeFix, action: TypeScript.CodeFixAction) => boolean =
  untypedAcceptsAction;

export const codeFixes: readonly CodeFix[] = untypedCodeFixes;
