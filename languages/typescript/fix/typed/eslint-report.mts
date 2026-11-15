import { fieldOf, listOf } from '../../../../shared/values/readers.mts';
import type { LintMessage } from '../suggestions/typed/suggestion-views.mts';

export type ReportedFile = {
  readonly filePath: string;
  readonly output: unknown;
  readonly messages: readonly LintMessage[];
};

function fixOf(value: unknown): LintMessage['fix'] {
  if (value === undefined) {
    return undefined;
  }
  const text = fieldOf(value, 'text');
  return {
    range: listOf(fieldOf(value, 'range')).map((position) =>
      typeof position === 'number' ? position : Number.NaN,
    ),
    ...(typeof text === 'string' ? { text } : {}),
  };
}

export function messageOf(value: unknown): LintMessage {
  const ruleId = fieldOf(value, 'ruleId');
  const line = fieldOf(value, 'line');
  const fix = fixOf(fieldOf(value, 'fix'));
  const suggestions = fieldOf(value, 'suggestions');
  return {
    ...(typeof ruleId === 'string' ? { ruleId } : {}),
    ...(typeof line === 'number' ? { line } : {}),
    ...(fieldOf(value, 'fatal') === true ? { fatal: true } : {}),
    ...(fix === undefined ? {} : { fix }),
    ...(Array.isArray(suggestions)
      ? {
          suggestions: listOf(suggestions).map((suggestion) => ({
            fix: fixOf(fieldOf(suggestion, 'fix')),
          })),
        }
      : {}),
  };
}

export function reportedFilesOf(results: readonly unknown[]): ReportedFile[] {
  return results.map((result) => ({
    filePath: String(fieldOf(result, 'filePath')),
    output: fieldOf(result, 'output'),
    messages: listOf(fieldOf(result, 'messages')).map(messageOf),
  }));
}
