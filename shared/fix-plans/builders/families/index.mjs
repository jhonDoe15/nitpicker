import { ALL_PRESETS, JVM_PRESETS, TYPESCRIPT_PRESETS } from '../../common/presets.mjs';
import { followRule } from './generic.mjs';
import { kindOfRule } from './kinds.mjs';
import { ARCHUNIT_RULES, KOTLIN_PMD_RULES, KOTLIN_SOURCE_RULES } from './jvm-rules.mjs';
import { PYTHON_COUPLING_RULES, PYTHON_RULES } from './python-rules.mjs';
import { TYPESCRIPT_NITPICKER_RULES } from './typescript-rules.mjs';

const OWNED_ELSEWHERE = new Set([
  'eslint/nitpicker/cognitive-complexity',
  'coupling/package-cycle',
]);

const FAMILIES = [
  { tool: 'eslint', presets: TYPESCRIPT_PRESETS, rules: TYPESCRIPT_NITPICKER_RULES },
  { tool: 'python-rules', presets: ['python'], rules: PYTHON_RULES },
  { tool: 'coupling', presets: ['python'], rules: PYTHON_COUPLING_RULES },
  { tool: 'kotlin-source', presets: ['kotlin'], rules: KOTLIN_SOURCE_RULES },
  { tool: 'pmd', presets: ['kotlin'], rules: KOTLIN_PMD_RULES },
  { tool: 'detekt', presets: ['kotlin'], rules: ['test-without-assertion'] },
  { tool: 'kotlinc', presets: ['kotlin'], rules: ['unchecked'] },
  { tool: 'archunit', presets: JVM_PRESETS, rules: ARCHUNIT_RULES },
  { tool: 'test-runtime', presets: JVM_PRESETS, rules: ['test-not-run'] },
  { tool: 'dead-code', presets: [...TYPESCRIPT_PRESETS, 'python'], rules: ['unresolved-import'] },
  {
    tool: 'structure',
    presets: ALL_PRESETS,
    rules: [
      'new-icon-asset',
      'redefined-library-component',
      'component-story-missing',
      'caller-protocol',
      'context-threading',
      'data-clump',
      'disjoint-consumer-groups',
      'foreign-state-decision',
      'forwarding-chain',
      'mutable-state-escape',
      'protocol-contract',
      'repeated-policy-decision',
    ],
  },
  { tool: 'test-console', presets: ALL_PRESETS, rules: ['test-console-output'] },
  { tool: 'test-runtime', presets: ALL_PRESETS, rules: ['slow-test'] },
];

function buildersOf({ tool, presets, rules }, position) {
  const kept = rules.filter((rule) => !OWNED_ELSEWHERE.has(`${tool}/${rule}`));
  const byKind = Map.groupBy(kept, kindOfRule);
  return [...byKind].map(([kind, kindRules]) => ({
    id: `${tool}-${kind}-${String(position)}`,
    rules: kindRules.map((rule) => ({ tool, rule })),
    presets,
    build: followRule(kind),
  }));
}

export const FAMILY_BUILDERS = FAMILIES.flatMap(buildersOf);
