import {
  blackForceExclude as untypedBlackForceExclude,
  formatStdinCommand as untypedFormatStdin,
  lintFixCommands as untypedLintFixCommands,
} from '../python-fix-commands.mjs';
import { reviewCodesSelected as untypedReviewCodes } from '../review/review-rules.mjs';
import { withPythonFixContext as untypedWithContext } from '../python-fix-session.mjs';

export type FixToolContext = unknown;
export type ProbeInvocation = { operation?: string };

export const withPythonFixContext: <Result>(
  settings: {
    projectRoot: string;
    config: object;
    headPolicy: object;
    executeFixCommand: (invocation: ProbeInvocation) => unknown;
  },
  use: (context: FixToolContext) => Result,
) => Result = untypedWithContext;
export const reviewCodesSelected: (selectedRules?: string[]) => string[] = untypedReviewCodes;
export const lintFixCommands: (
  context: FixToolContext,
  fixable?: string[],
) => (file: string) => string[] = untypedLintFixCommands;
export const formatStdinCommand: (context: FixToolContext, file: string) => string[] =
  untypedFormatStdin;
export const blackForceExclude: (context: FixToolContext, options: readonly string[]) => string[] =
  untypedBlackForceExclude;
