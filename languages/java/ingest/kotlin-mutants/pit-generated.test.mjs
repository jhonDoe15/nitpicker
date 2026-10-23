import { describe, expect, it } from 'vitest';
import { ingestPit } from '../pit.mjs';
import { createGeneratedFilter } from './generated-filter.mjs';

const FILE = 'src/main/kotlin/demo/Demo.kt';
const facts = {
  files: [
    {
      file: FILE,
      package: 'demo',
      lines: 20,
      classes: [],
      functions: [],
      lambdas: [],
      branching: [7],
      casts: [],
    },
  ],
};

function mutation({
  status,
  className = 'demo.DemoKt',
  method = 'run',
  line,
  mutator,
  description,
}) {
  return [
    `<mutation detected='${String(status === 'KILLED')}' status='${status}' numberOfTestsRun='1'>`,
    `<sourceFile>Demo.kt</sourceFile><mutatedClass>${className}</mutatedClass>`,
    `<mutatedMethod>${method}</mutatedMethod><methodDescription>()V</methodDescription>`,
    `<lineNumber>${String(line)}</lineNumber>`,
    `<mutator>org.pitest.mutationtest.engine.gregor.mutators.${mutator}</mutator>`,
    `<indexes><index>1</index></indexes><blocks><block>1</block></blocks><killingTest/>`,
    `<description>${description}</description></mutation>`,
  ].join('');
}

const REPORT = `<?xml version="1.0" encoding="UTF-8"?>
<mutations partial="false">
${[
  {
    status: 'SURVIVED',
    method: 'invokeSuspend',
    line: 5,
    mutator: 'VoidMethodCallMutator',
    description: 'removed call to kotlin/ResultKt::throwOnFailure',
  },
  {
    status: 'KILLED',
    line: 5,
    mutator: 'VoidMethodCallMutator',
    description: 'removed call to kotlin/jvm/internal/Intrinsics::checkNotNullParameter',
  },
  {
    status: 'NO_COVERAGE',
    line: 5,
    mutator: 'VoidMethodCallMutator',
    description: 'removed call to demo/Log::write',
  },
  {
    status: 'SURVIVED',
    line: 7,
    mutator: 'ConditionalsBoundaryMutator',
    description: 'changed conditional boundary',
  },
  {
    status: 'SURVIVED',
    className: 'demo.Gone',
    line: 3,
    mutator: 'NegateConditionalsMutator',
    description: 'negated conditional',
  },
]
  .map(mutation)
  .join('\n')}
</mutations>
`;

const resolvePath = (className, sourceFile) =>
  className === 'demo.Gone' ? undefined : `src/main/kotlin/demo/${sourceFile}`;

const summary = (findings) =>
  findings
    .filter((finding) => finding.rule === 'mutation-summary')
    .map(({ identity, metric }) => [identity, metric.value]);
const mutants = (findings) =>
  findings
    .filter((finding) => finding.rule !== 'mutation-summary')
    .map(({ rule, classification, location }) => [rule, classification, location.line]);

describe('ingestPit with a filter for generated code', () => {
  it('reports every mutant of the Java rules when no filter is given', () => {
    const { findings } = ingestPit(REPORT, { resolvePath });

    expect([mutants(findings), summary(findings)]).toEqual([
      [
        ['mutant-survived', 'enforceable', 5],
        ['mutant-nocoverage', 'enforceable', 5],
        ['mutant-survived', 'enforceable', 7],
      ],
      [
        ['status:Survived', 3],
        ['status:Killed', 1],
        ['status:NoCoverage', 1],
      ],
    ]);
  });

  it('leaves the mutants of generated code out of the findings and the counts, and counts them apart', () => {
    const { findings } = ingestPit(REPORT, {
      resolvePath,
      generated: createGeneratedFilter(facts),
    });

    expect([mutants(findings), summary(findings)]).toEqual([
      [
        ['mutant-nocoverage', 'enforceable', 5],
        ['mutant-survived', 'enforceable', 7],
      ],
      [
        ['status:NoCoverage', 1],
        ['status:Survived', 2],
        ['status:GeneratedCode', 2],
      ],
    ]);
  });
});
