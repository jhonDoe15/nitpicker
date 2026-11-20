import { COMMENTED_OUT_CODE_RULE } from '../../../adapters/comments/comment-findings.mts';
import { removableCode as untypedRemovableCode } from '../../../adapters/comments/commented-out-code.mts';
import type { FixRecipe, RecipeFix, RuleRef } from '../../../../../core/fix/typed/fix-types.mts';
import { lineOf } from '../../../adapters/suppressions/java-suppressions.mts';
import { removalSpan } from '../shared/spans.mts';

type Removable = { readonly offset: number; readonly start: number; readonly end: number };

const JAVA_FILE = /\.java$/u;
const RULE: RuleRef = { tool: 'pmd', rule: COMMENTED_OUT_CODE_RULE };
const removableCode: (source: string) => readonly Removable[] = untypedRemovableCode;

function fixOf(name: string, text: string, { offset, start, end }: Removable): RecipeFix {
  return {
    finding: { ...RULE, path: name, line: lineOf(text, offset) },
    edits: [{ type: 'replace', path: name, ...removalSpan(text, start, end) }],
  };
}

export const javaCommentedCodeRecipe: FixRecipe = {
  id: 'java-commented-out-code',
  rules: [RULE],
  presets: ['java'],
  scope: 'file',
  safety: 'safe',
  plan({ files }) {
    const sources = files.filter(({ path: name }) => JAVA_FILE.test(name));
    return {
      fixes: sources.flatMap(({ path: name, text }) =>
        removableCode(text).map((found) => fixOf(name, text, found)),
      ),
    };
  },
};
