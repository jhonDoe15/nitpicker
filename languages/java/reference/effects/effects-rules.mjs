import { entriesFrom } from '../../../../shared/reference/entry.mjs';
import { asSentence } from '../../../../shared/reference/build/text.mjs';
import { guideCell } from '../../../../shared/reference/build/guide-tables.mjs';
import { EFFECTS_MESSAGES } from '../../adapters/effects/effects-messages.mjs';
import { JVM_ANALYZERS, JVM_BUILDS } from '../catalog-rules.mjs';

const GUIDE = 'docs/java-preset.md';
const METHOD = '<method>';
const HOLDER = '<holder>';
const PATH = ['<helper>', '<call>'];
const ENTITY = '<Entity>';
const SAVE = '<repository>.save()';
const FIND = '<repository>.findBy()';
const WRITE = [SAVE];
const SAMPLES = [
  ['IoCallInLoop', { method: METHOD, kind: 'database', form: 'loop', path: PATH }],
  ['AccumulatorCopyInLoop', { method: METHOD, variable: '<variable>', form: 'loop' }],
  [
    'LazyRelationInLoop',
    { method: METHOD, entity: ENTITY, relation: '<relation>', origin: '<query>' },
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
  ['DualWriteWithoutOutbox', { method: METHOD, form: 'inline', write: WRITE, path: PATH }],
  [
    'CheckThenWriteWithoutLock',
    { method: METHOD, read: '<repository>.existsBy...()', write: SAVE },
  ],
  ['GraphqlFieldPerParent', { method: METHOD, framework: 'spring', kind: 'database', path: PATH }],
  ['ReactiveLookupPerElement', { method: METHOD, kind: 'database', path: PATH }],
  ['RowsChangedInMemory', { method: METHOD, form: 'update', origin: FIND, entity: ENTITY }],
  [
    'EntityLoadedForOneColumn',
    { method: METHOD, entity: ENTITY, property: 'getEmail', origin: FIND },
  ],
  ['EntityLoadedForExistence', { method: METHOD, form: 'count', origin: '<repository>.countBy()' }],
  ['RetryWithStaleObject', { method: METHOD, scope: 'retry loop', object: 'order', write: SAVE }],
  [
    'AsyncMethodDoesBlockingWork',
    {
      method: METHOD,
      wrapper: 'CompletableFuture.completedFuture()',
      path: [FIND],
    },
  ],
  ['WaitOnAsyncTwin', { method: METHOD, async: '<Dao>.findByIdAsync()', sync: 'findById()' }],
  [
    'JobLoopWithoutItemIsolation',
    { method: METHOD, job: '@Scheduled', kind: 'database', path: PATH },
  ],
  [
    'SoftDeleteFilterMissing',
    { entity: ENTITY, column: 'deletedAt', read: '<query>', filtered: 9, total: 10 },
  ],
  [
    'DeletedItemInMemory',
    { entity: ENTITY, flag: 'deletedAt', source: '<collection>', guarded: 9, units: 10 },
  ],
  ['HandlerWithoutAuth', { shape: '@PreAuthorize', declared: 9, total: 10 }],
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
