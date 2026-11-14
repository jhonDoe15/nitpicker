import type TypeScript from 'typescript';
import { typescriptApi } from '../typed/typescript-program.mts';
import { type Mutant, compile, readCompilerConfigs } from './compiler.mts';
import { addedDiagnostics, diagnosticCounts } from './diagnostics.mts';

type CheckResult =
  { readonly status: 'passed' } | { readonly status: 'compileError'; readonly reason: string };

type CheckerState = {
  configs: readonly TypeScript.ParsedCommandLine[];
  baseline: ReadonlyMap<string, number>;
};

type Checker = {
  readonly init: () => void;
  readonly check: (mutants: readonly Mutant[]) => Record<string, CheckResult>;
};

type CheckerPlugin = {
  readonly kind: 'Checker';
  readonly name: string;
  readonly factory: ((options: { readonly tsconfigFile: string }) => Checker) & {
    readonly inject: readonly string[];
  };
};

const ts = typescriptApi();

function checkMutant(state: CheckerState, mutant: Mutant): CheckResult {
  const diagnostics = addedDiagnostics(
    state.configs.flatMap((config) => compile(config, mutant)),
    state.baseline,
  );
  return diagnostics.length === 0
    ? { status: 'passed' }
    : {
        status: 'compileError',
        reason: diagnostics
          .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
          .join('\n'),
      };
}

function createChecker(options: { readonly tsconfigFile: string }): Checker {
  const state: CheckerState = { configs: [], baseline: new Map() };
  return {
    init() {
      state.configs = readCompilerConfigs(options.tsconfigFile);
      state.baseline = diagnosticCounts(state.configs.flatMap((config) => compile(config)));
    },
    check(mutants) {
      return Object.fromEntries(mutants.map((mutant) => [mutant.id, checkMutant(state, mutant)]));
    },
  };
}
export const strykerPlugins: readonly [CheckerPlugin] = [
  {
    kind: 'Checker',
    name: 'nitpicker-typescript',
    factory: Object.assign(createChecker, { inject: ['options'] }),
  },
];
