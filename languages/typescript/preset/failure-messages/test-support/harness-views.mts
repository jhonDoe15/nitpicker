import { Linter } from 'eslint';
import { appendSentence as untypedAppendSentence } from '../../../../../shared/messages/exception-sentence.mjs';

const linterClass: new () => {
  verify(code: string, config: unknown, options: { filename: string }): Linter.LintMessage[];
} = Linter;

export const linter = new linterClass();

export const appendSentence: (message: string, sentence: string | undefined) => string =
  untypedAppendSentence;
