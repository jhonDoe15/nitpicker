import type { Finding } from '../../../static-checks/shared.mts';
import type { StrykerConfig } from '../../typed/mutation.mts';
import { mutatePatterns } from '../stryker/stryker-config.mts';
import { escapeGlob } from '../../../oxlint/oxlint-translation.mts';

export type UninstrumentedFile = {
  readonly file: string;
  readonly line: string;
  readonly placer: string;
  readonly mutators: string;
};

const PLACEMENT_ERROR =
  /(?<file>[^\s:]+):(?<line>\d+):\d+ (?<placer>\w+) could not place mutants with type\(s\): "(?<mutators>[^"]*)"/u;
const UNINSTRUMENTED_RULE = 'mutation-file-not-instrumented';

export function uninstrumentedFile(message: string): UninstrumentedFile | undefined {
  const groups = PLACEMENT_ERROR.exec(message)?.groups;
  if (groups?.['file'] === undefined || /^\.\.(?:[/\\]|$)/u.test(groups['file'])) {
    return undefined;
  }
  return {
    file: groups['file'].replaceAll('\\', '/'),
    line: groups['line'] ?? '',
    placer: groups['placer'] ?? '',
    mutators: groups['mutators'] ?? '',
  };
}

export function withoutMutatedFile(config: StrykerConfig, file: string): StrykerConfig | undefined {
  const patterns = mutatePatterns(config);
  return patterns === undefined
    ? undefined
    : { ...config, mutate: [...patterns, `!${escapeGlob(file.replace(/^\.\//u, ''))}`] };
}

export function uninstrumentedNote(
  analyzerName: string,
  { file, line, placer, mutators }: UninstrumentedFile,
): Finding {
  return {
    tool: analyzerName,
    rule: UNINSTRUMENTED_RULE,
    path: file,
    identity: UNINSTRUMENTED_RULE,
    message:
      `mutation could not instrument ${file} (Stryker's ${placer} could not place ${mutators} ` +
      `mutants at line ${line}), so its mutants were not tested; the other files were mutated. ` +
      'The failure is a Stryker bug, not a problem in this code.',
    classification: 'descriptive',
  };
}
