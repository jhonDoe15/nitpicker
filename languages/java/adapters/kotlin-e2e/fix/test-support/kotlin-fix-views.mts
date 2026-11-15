import type { ExitCode } from '../../../../../../core/cli-context.mts';
import type { Finding } from '../../../../../../shared/values/findings.mts';
import {
  fixReport,
  useFixProject as useCoreFixProject,
} from '../../../../../../core/fix/test-support/fix-project.mts';
import { findingsOf } from '../../../kotlin/rules/test-support/findings-list.mts';

type FileMap = Readonly<Record<string, string>>;

export type FixRequest = {
  readonly committed: FileMap;
  readonly changed: FileMap;
  readonly cliArguments?: string[];
  readonly realAnalyzers?: true;
};

export type FixResult = {
  readonly exitCode: ExitCode;
  readonly stdout: string;
  readonly stderr: string;
  read(name: string): string;
  baseSource(name: string): string;
  newFindings(): Finding[];
  toolErrors(): Finding[];
};

export { fixReport };

export function useFixProject(): { fix: (input: FixRequest) => FixResult } {
  const { fix } = useCoreFixProject();
  return {
    fix(input) {
      const result = fix(input);
      return {
        ...result,
        newFindings: () => findingsOf(result.newFindings()),
        toolErrors: () => findingsOf(result.toolErrors()),
      };
    },
  };
}
