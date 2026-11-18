import { JVM_RECIPES } from '../../../languages/java/fix/recipes/jvm-recipes.mts';
import { fakeGoFormat as untypedFakeGoFormat } from '../../../languages/go/fix/test-support/fake-go-format.mts';
import { fakePythonTools as untypedFakePythonTools } from '../../../languages/python/fix/test-support/fake-python-fix.mts';
import { recipeSpecs } from './engine-views.mts';
import type { PlanContext, RecipeSpec } from './engine-views.mts';
import type { CliRunInput } from '../../command/test-support/fixture-types.mts';
import type { FixInvocation } from '../typed/fix-types.mts';

export type FixCliInput = CliRunInput & { readonly fixRecipes?: unknown };

type ToolCall = { readonly operation?: string | undefined; readonly args: readonly string[] };

export type ToolSet = {
  readonly executeFixCommand: (invocation: FixInvocation) => unknown;
};

export type FakeTools = ToolSet & {
  readonly calls: readonly unknown[];
  readonly operations: () => readonly (string | undefined)[];
};

export type PythonTools = FakeTools & {
  readonly callsOf: (operation: string) => readonly ToolCall[];
};

export const fakeGoFormat: () => ToolSet = untypedFakeGoFormat;

export { fakeJvmTools } from '../../../languages/java/fix/test-support/fake-jvm-tools.mts';

export const fakePythonTools: (options?: {
  readonly lintEdit?: (file: string, input: string) => string;
  readonly lintStatus?: number;
  readonly formatFailure?: string;
  readonly jupyterMissing?: true;
  readonly missingFormatter?: true;
  readonly sourceFixes?: true;
}) => PythonTools = untypedFakePythonTools;

export const jvmRecipes = recipeSpecs(JVM_RECIPES);

const TODO = 'TODO';

export function todoRecipe(id: string, rule: string, safety: string): RecipeSpec {
  return {
    id,
    rules: [{ tool: 'checkstyle', rule }],
    presets: ['java'],
    scope: 'file',
    safety,
    plan: ({ files }: PlanContext) => ({
      fixes: files.flatMap(({ path: name, text }) => {
        const start = text.indexOf(TODO);
        return name.endsWith('.java') && start !== -1
          ? [
              {
                finding: { tool: 'checkstyle', rule, path: name, line: 1 },
                edits: [
                  { type: 'replace', path: name, start, end: start + TODO.length, text: 'DONE' },
                ],
              },
            ]
          : [];
      }),
    }),
  };
}
