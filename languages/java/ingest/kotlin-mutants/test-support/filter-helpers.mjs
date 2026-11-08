import { createGeneratedFilter } from '../generated-filter.mjs';

export const FILE = 'src/main/kotlin/demo/Demo.kt';
export const emptyClass = {
  name: 'demo.Demo',
  kind: 'class',
  start: 1,
  headerEnd: 1,
  init: false,
  serializable: false,
  functions: [],
  properties: [],
};
const emptyFile = {
  file: FILE,
  package: 'demo',
  lines: 40,
  classes: [],
  functions: [],
  lambdas: [],
  branching: [],
  casts: [],
  exhaustiveLastEntries: [],
};

export function filterFor(file = {}, mutants = []) {
  return createGeneratedFilter({ files: [{ ...emptyFile, ...file }] })(mutants);
}

export function mutant(overrides) {
  return {
    status: 'SURVIVED',
    className: 'demo.DemoKt',
    sourceFile: 'Demo.kt',
    method: 'run',
    methodDescription: '()V',
    mutator: 'org.pitest.mutationtest.engine.gregor.mutators.VoidMethodCallMutator',
    mutatorName: 'VoidMethodCallMutator',
    description: '',
    line: 5,
    block: 0,
    ...overrides,
  };
}

export const returns = {
  mutatorName: 'NullReturnValsMutator',
  description: 'replaced return value with null',
};
export const negate = {
  mutatorName: 'NegateConditionalsMutator',
  description: 'negated conditional',
};
export const boundary = {
  mutatorName: 'ConditionalsBoundaryMutator',
  description: 'changed conditional boundary',
};
export function removed(call) {
  return { description: `removed call to ${call}` };
}

export function lambda(fields) {
  return { returnLines: [], discarded: false, projectCallee: false, unitCallee: false, ...fields };
}

export function fn(fields) {
  return {
    class: 'demo.DemoKt',
    suspend: false,
    inline: false,
    returnsUnit: false,
    inlineCalls: [],
    ...fields,
  };
}
