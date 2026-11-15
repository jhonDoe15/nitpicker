import type { HintInput } from '../../../../adapters/hints/eslint-routes.mts';
import { typescriptApi } from '../../../../adapters/typed/typescript-program.mts';

export function hintInput(ruleId: string, text: string, relativePath: string): HintInput {
  const ts = typescriptApi();
  return {
    ruleId,
    text,
    relativePath,
    node: undefined,
    sourceFile: ts.createSourceFile(relativePath, '', ts.ScriptTarget.Latest),
  };
}
