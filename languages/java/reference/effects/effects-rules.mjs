import { entriesFrom } from '../../../../shared/reference/entry.mjs';
import { asSentence } from '../../../../shared/reference/build/text.mjs';
import { guideCell } from '../../../../shared/reference/build/guide-tables.mjs';
import { EFFECTS_MESSAGES } from '../../adapters/effects/effects-messages.mjs';
import { JVM_ANALYZERS, JVM_BUILDS } from '../catalog-rules.mjs';

const GUIDE = 'docs/java-preset.md';
const METHOD = '<method>';
const HOLDER = '<holder>';
const PATH = ['<helper>', '<call>'];
const SAMPLES = [
  ['IoCallInLoop', { method: METHOD, kind: 'database', form: 'loop', path: PATH }],
  ['AccumulatorCopyInLoop', { method: METHOD, variable: '<variable>', form: 'loop' }],
  [
    'LazyRelationInLoop',
    { method: METHOD, entity: '<Entity>', relation: '<relation>', origin: '<query>' },
  ],
  [
    'RemoteCallInTransaction',
    { method: METHOD, scope: '@Transactional', holder: HOLDER, path: PATH },
  ],
  ['RemoteCallUnderLock', { method: METHOD, scope: 'synchronized', holder: HOLDER, path: PATH }],
  [
    'RetryWithoutIdempotency',
    { method: METHOD, scope: '@Retryable', holder: HOLDER, write: 'insert', path: PATH },
  ],
];
const WHY =
  'The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.';

/** The entries of the rules of the effects engine. */
export function effectsEntries() {
  return entriesFrom(
    {
      page: 'java-nitpicker',
      analyzers: JVM_ANALYZERS,
      builds: JVM_BUILDS,
      tool: 'effects',
      why: WHY,
      docs: [
        { label: 'Java preset guide', path: 'docs/java-preset/effects-rules.md' },
        { label: 'Kotlin preset guide', path: 'docs/kotlin-preset/effects-rules.md' },
      ],
    },
    SAMPLES.map(([rule, sample]) => [
      rule,
      asSentence(guideCell(GUIDE, rule, 'reports')),
      EFFECTS_MESSAGES[rule](sample, 'java'),
    ]),
  );
}
