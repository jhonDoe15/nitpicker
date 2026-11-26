import { Linter } from 'eslint';
import { appendSentence as untypedAppendSentence } from '../../../../../../shared/messages/exception-sentence.mts';

const linterClass: new (options?: { readonly cwd: string }) => {
  verify(code: string, config: unknown, options: { filename: string }): Linter.LintMessage[];
} = Linter;

export const linter = new linterClass();

export function linterIn(cwd: string): InstanceType<typeof linterClass> {
  return new linterClass({ cwd });
}

export const appendSentence: (message: string, sentence: string | undefined) => string =
  untypedAppendSentence;
