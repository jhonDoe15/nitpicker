import type { Finding } from '../../../../../../shared/values/findings.mts';
import {
  fixReport as untypedFixReport,
  useFixProject as untypedUseFixProject,
} from '../../../../../../core/fix/test-support/fix-project.mjs';

type FileMap = Readonly<Record<string, string>>;

type FixInput = {
  readonly committed: FileMap;
  readonly changed: FileMap;
  readonly cliArguments?: string[];
  readonly prepare: ((root: string) => void) | undefined;
  readonly realAnalyzers: boolean;
};

export type FixResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  read(name: string): string;
  baseSource(name: string): string;
  newFindings(): Finding[];
  toolErrors(): Finding[];
};

export type FixRequest = Omit<FixInput, 'prepare' | 'realAnalyzers'> & {
  readonly realAnalyzers?: true;
};

export const fixReport: (stdout: string) => string = untypedFixReport;

export function useFixProject(): { fix: (input: FixRequest) => FixResult } {
  const { fix } = untypedUseFixProject();
  const typedFix: (input: FixInput) => FixResult = fix;
  return {
    fix(input) {
      return typedFix({
        prepare: undefined,
        ...input,
        realAnalyzers: input.realAnalyzers === true,
      });
    },
  };
}
