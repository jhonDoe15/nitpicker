import { createTypescriptProject as untypedCreateTypescriptProject } from '../../../../../core/diff/tests/policy/base-red/test-support/typescript-project.mjs';

type GateResult = {
  readonly exitCode: unknown;
  readonly text: string;
  readonly json: (name: string) => unknown;
  readonly enforceable: () => string[];
};

export type TypescriptProject = {
  readonly commitBranch: (
    name: string,
    files: Readonly<Record<string, string>>,
    from: string,
  ) => void;
  readonly gate: (
    branch: string,
    options: {
      readonly base?: string;
      readonly analyzers: string[];
      readonly extraArguments?: string[];
    },
  ) => GateResult;
  readonly remove: () => void;
};

export const createTypescriptProject: (options: {
  readonly packageRoot: string;
  readonly prefix: string;
  readonly files: Readonly<Record<string, string>>;
}) => TypescriptProject = untypedCreateTypescriptProject;
