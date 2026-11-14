import {
  explainedError as untypedExplainedError,
  troubleshootingError as untypedTroubleshootingError,
  withTroubleshooting as untypedWithTroubleshooting,
} from '../../../../../shared/messages/troubleshooting.mjs';
import { withTemporaryWorktree as untypedWithTemporaryWorktree } from '../../../../../core/diff/git/repository/worktree.mjs';
import { linkSentence as untypedLinkSentence } from '../../../../../shared/messages/test-support/link-sentence.mjs';
import { projectFilePaths as untypedProjectFilePaths } from '../../../../../shared/project-files/project-files.mjs';

export const explainedError: (message: string) => Error = untypedExplainedError;

export const troubleshootingError: (message: string, anchor: string) => Error =
  untypedTroubleshootingError;

export const withTroubleshooting: (message: string, anchor: string) => string =
  untypedWithTroubleshooting;

export const projectFilePaths: (root: string) => string[] = untypedProjectFilePaths;

export const withTemporaryWorktree: <T>(
  repositoryRoot: string,
  options: { readonly commitSha: string; readonly warn: () => void },
  operation: (worktreeRoot: string) => T,
) => T = untypedWithTemporaryWorktree;

export function linkSentence(key: string): string {
  const sentence = untypedLinkSentence(key);
  if (sentence === undefined) {
    throw new Error(`No troubleshooting sentence for ${key}`);
  }
  return sentence;
}
