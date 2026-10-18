import ts from 'typescript';
import { compile, readCompilerConfigs } from './compiler.mjs';
import { addedDiagnostics, diagnosticCounts } from './diagnostics.mjs';

function checkMutant(state, mutant) {
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

function createChecker(options) {
  const state = {};
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
export const strykerPlugins = [
  {
    kind: 'Checker',
    name: 'nitpicker-typescript',
    factory: Object.assign(createChecker, { inject: ['options'] }),
  },
];
