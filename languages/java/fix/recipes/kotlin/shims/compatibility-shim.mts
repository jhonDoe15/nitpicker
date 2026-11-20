import type { RecipeFix } from '../../../../../../core/fix/typed/fix-types.mts';
import { compatibilityShims } from '../../../../adapters/kotlin/scan/signatures/compatibility-shims.mts';
import { lineAt } from '../shared/kotlin-scan.mts';
import { aliasPlan } from './alias-shim.mts';
import { deprecatedFunctionPlan } from './deprecated-function-shim.mts';
import { projectRecipe } from './source-index.mts';
import type { PathEdit, Source } from './source-index.mts';

const RULE = { tool: 'kotlin-source', rule: 'CompatibilityShim' };

type Shim = { readonly offset: number; readonly subject: string };

function located(
  source: Source,
  offset: number,
): { tool: string; rule: string; path: string; line: number } {
  return { ...RULE, path: source.path, line: lineAt(source.text, offset) };
}

function fixesIn(sources: readonly Source[], source: Source): RecipeFix[] {
  const shims: readonly Shim[] = compatibilityShims(source.scanned);
  return shims.flatMap(({ offset, subject }): RecipeFix[] => {
    const deprecated = shims.find(
      (other) =>
        other.subject === '@Deprecated' &&
        source.scanned.code.slice(other.offset, offset).split('\n').length === 2 &&
        subject.startsWith('typealias'),
    );
    const edits: readonly PathEdit[] | undefined = subject.startsWith('typealias')
      ? aliasPlan({ sources, source, offset, deprecated: deprecated?.offset })?.edits
      : deprecatedFunctionPlan(sources, source, offset);
    if (edits === undefined) {
      return [];
    }
    return [
      {
        finding: located(source, offset),
        ...(deprecated === undefined ? {} : { alsoFixes: [located(source, deprecated.offset)] }),
        edits: edits.map((edit) => ({ type: 'replace', ...edit })),
      },
    ];
  });
}

export const kotlinCompatibilityShimRecipe = projectRecipe({
  id: 'kotlin-compatibility-shim',
  rule: RULE,
  where: 'main',
  find: ({ sources, source }) => fixesIn(sources, source),
});
