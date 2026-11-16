import type TypeScript from 'typescript';
import {
  REVIEW as untypedReview,
  SAFE as untypedSafe,
} from '../../../../core/fix/engine/safety.mjs';

export type CodeFix = {
  readonly id: string;
  readonly safety: string;
  readonly codes: readonly number[];
  readonly fixName: string;
  readonly description?: RegExp;
  readonly needs?: RegExp;
};

export type SourceText = { readonly name: string; readonly text: string };

const REVIEW: string = untypedReview;
const SAFE: string = untypedSafe;
const CODE_FIX_TOOL = 'typescript-typecheck';

export const codeFixes: readonly CodeFix[] = Object.freeze([
  { id: 'missing-import', safety: REVIEW, codes: [2304, 2552, 2686], fixName: 'import' },
  {
    id: 'unused-declaration',
    safety: REVIEW,
    codes: [6133, 6192, 6196, 6198, 6199, 6205],
    fixName: 'unusedIdentifier',
    description: /^Remove /u,
  },
  {
    id: 'missing-await',
    safety: REVIEW,
    codes: [2322, 2339, 2345, 2365, 2769, 2773, 2774, 2801, 80007],
    fixName: 'addMissingAwait',
  },
  { id: 'missing-async', safety: REVIEW, codes: [1308], fixName: 'fixAwaitInSyncFunction' },
  { id: 'missing-const', safety: REVIEW, codes: [2304, 18004], fixName: 'addMissingConst' },
  {
    id: 'add-override',
    safety: SAFE,
    codes: [4114, 4115, 4116],
    fixName: 'fixOverrideModifier',
    needs: /\bextends\b/u,
  },
  {
    id: 'remove-override',
    safety: REVIEW,
    codes: [4112, 4113],
    fixName: 'fixOverrideModifier',
    needs: /\bextends\b/u,
  },
]);

export function codeName(code: number): string {
  return `${CODE_FIX_TOOL}/TS${String(code)}`;
}

export function selectedCodeFixes(selectedRules: readonly string[]): CodeFix[] {
  const selected = new Set(selectedRules);
  return codeFixes.filter((fix) =>
    selected.size === 0
      ? fix.safety === SAFE
      : fix.codes.some((code) => selected.has(codeName(code))),
  );
}

export function candidateFiles(
  fixes: readonly CodeFix[],
  files: readonly SourceText[],
): SourceText[] {
  return files.filter(({ text }) =>
    fixes.some(({ needs }) => needs === undefined || needs.test(text)),
  );
}

export function fixesForCode(fixes: readonly CodeFix[], code: number): CodeFix[] {
  return fixes.filter((fix) => fix.codes.includes(code));
}

export function acceptsAction(fix: CodeFix, action: TypeScript.CodeFixAction): boolean {
  return (
    action.fixName === fix.fixName &&
    (fix.description === undefined || fix.description.test(action.description))
  );
}
