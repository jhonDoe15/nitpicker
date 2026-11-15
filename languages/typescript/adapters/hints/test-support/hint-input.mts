import {
  eslintMessageWithHint as hintedMessage,
  routedEslintFields as routedFields,
} from '../eslint-hints.mts';
import type { HintInput } from '../eslint-routes.mts';
import { typescriptApi } from '../../typed/typescript-program.mts';

type TestHintInput = Pick<HintInput, 'ruleId' | 'text' | 'relativePath'> &
  Partial<Pick<HintInput, 'node' | 'sourceFile'>>;

const ts = typescriptApi();
const EMPTY_SOURCE = ts.createSourceFile('hint.ts', '', ts.ScriptTarget.Latest);

export function eslintMessageWithHint(input: TestHintInput): string {
  return hintedMessage({ node: undefined, sourceFile: EMPTY_SOURCE, ...input });
}

export function routedEslintFields(input: TestHintInput): ReturnType<typeof routedFields> {
  return routedFields({ node: undefined, sourceFile: EMPTY_SOURCE, ...input });
}
