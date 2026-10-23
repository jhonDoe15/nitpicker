import { afterAll, beforeAll } from 'vitest';
import {
  BROKEN,
  GENERATED,
  GENERATED_TEST,
  LABEL,
  LABEL_ONE_SIDED_TEST,
  LIBRARY_CALLS,
  LIBRARY_CALLS_TEST,
  OFFSET,
  SPREAD,
  SPREAD_TEST,
} from '../test-support/kotlin-branch-coverage-data.mjs';
import { BOOTER, BOOTER_TEST, BOX_TEST, boxes } from '../test-support/kotlin-initializer-data.mjs';
import {
  COMBINE,
  COMBINE_TEST,
  DEEP,
  DEEP_TEST,
  FLATTEN,
  FLATTEN_TEST,
  GROWN,
  GROWN_TEST,
  GROWN_WIDER,
  GROWN_WIDER_TEST,
  PIPELINE,
  TIERS,
  TIERS_TEST,
  WIDE,
  WIDE_MOVED,
  WIDE_TEST,
  classifier,
  clonedClass,
  stabilityClass,
  stabilityFiles,
} from '../test-support/kotlin-structure-data.mjs';
import {
  commitBranch,
  commitFromBranch,
  commitFromStructureBase,
  initializeProject,
  kotlinSources,
  removeProject,
} from '../test-support/kotlin-e2e-project.mjs';

const TEST_ONLY_FILES = {
  [`${kotlinSources}/Shouting.kt`]:
    'package demo\n\nfun shout(text: String): String = text.uppercase()\n',
  [`${kotlinSources}/Tool.kt`]:
    'package demo\n\nfun main() {\n    check(toolName().isNotEmpty())\n}\n\nfun toolName(): String = "tool"\n',
  'src/test/kotlin/demo/ShoutingTest.kt': [
    'package demo',
    '',
    'import kotlin.test.Test',
    'import kotlin.test.assertEquals',
    '',
    'class ShoutingTest {',
    '    @Test',
    '    fun shouts() {',
    '        assertEquals("HI", shout("hi"))',
    '        assertEquals("tool", toolName())',
    '    }',
    '}',
    '',
  ].join('\n'),
};
// Each file gets its own fixture tree and retains the original setup and cleanup.
export function useKotlinCoverageProject() {
  let project;
  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'one-sided-branch', {
      [`${kotlinSources}/Label.kt`]: LABEL,
      'src/test/kotlin/demo/LabelTest.kt': LABEL_ONE_SIDED_TEST,
    });
    commitBranch(project, 'multiline-branch', {
      [`${kotlinSources}/Spread.kt`]: SPREAD,
      'src/test/kotlin/demo/SpreadTest.kt': SPREAD_TEST,
      'src/main/kotlin/Offset.kt': OFFSET,
    });
    commitBranch(project, 'library-branches', {
      [`${kotlinSources}/Library.kt`]: LIBRARY_CALLS,
      'src/test/kotlin/demo/LibraryTest.kt': LIBRARY_CALLS_TEST,
    });
    commitBranch(project, 'generated-branches', {
      [`${kotlinSources}/Generated.kt`]: GENERATED,
      'src/test/kotlin/demo/GeneratedTest.kt': GENERATED_TEST,
    });
    commitBranch(project, 'broken', { [`${kotlinSources}/Broken.kt`]: BROKEN });
    commitBranch(project, 'test-only', TEST_ONLY_FILES);
    commitBranch(project, 'init-base', {
      [`${kotlinSources}/boxes/Box.kt`]: boxes(false),
      'src/test/kotlin/demo/boxes/BoxTest.kt': BOX_TEST,
    });
    commitFromBranch(project, {
      name: 'init-inserted',
      from: 'init-base',
      files: { [`${kotlinSources}/boxes/Box.kt`]: boxes(true) },
    });
    commitBranch(project, 'structure-base', {
      [`${kotlinSources}/Wide.kt`]: WIDE,
      'src/test/kotlin/demo/WideTest.kt': WIDE_TEST,
      [`${kotlinSources}/Grown.kt`]: GROWN,
      'src/test/kotlin/demo/GrownTest.kt': GROWN_TEST,
      [`${kotlinSources}/Complex.kt`]: classifier('classify', 9),
      [`${kotlinSources}/Complex2.kt`]: classifier('classify2', 9, { step: 7 }),
      ...stabilityFiles(''),
    });
    commitFromStructureBase(project, 'head', {
      [`${kotlinSources}/Wide.kt`]: WIDE_MOVED,
      [`${kotlinSources}/Grown.kt`]: GROWN_WIDER,
      'src/test/kotlin/demo/GrownTest.kt': GROWN_WIDER_TEST,
      [`${kotlinSources}/Complex.kt`]: classifier('classify', 9, { bump: 2 }),
      [`${kotlinSources}/Complex2.kt`]: classifier('classify2', 10, { step: 7 }),
      [`${kotlinSources}/change/Deep.kt`]: DEEP,
      'src/test/kotlin/demo/change/DeepTest.kt': DEEP_TEST,
      [`${kotlinSources}/change/Rank.kt`]: classifier('rank', 9, { step: 13 }),
      [`${kotlinSources}/change/Tiers.kt`]: TIERS,
      'src/test/kotlin/demo/change/TiersTest.kt': TIERS_TEST,
      [`${kotlinSources}/change/Combine.kt`]: COMBINE,
      'src/test/kotlin/demo/change/CombineTest.kt': COMBINE_TEST,
      'src/main/kotlin/Flatten.kt': FLATTEN,
      'src/test/kotlin/FlattenTest.kt': FLATTEN_TEST,
      [`${kotlinSources}/build/Pipeline.kt`]: PIPELINE,
      [`${kotlinSources}/extra/Booter.kt`]: BOOTER,
      'src/test/kotlin/demo/change/BooterTest.kt': BOOTER_TEST,
      [`${kotlinSources}/extra/Left.kt`]: clonedClass('Left'),
      [`${kotlinSources}/extra/Right.kt`]: clonedClass('Right'),
      ...stabilityFiles('2'),
      'src/main/kotlin/stable/Core.kt': `${stabilityClass('stable', 'Core', 'churn.Volatile().value()')}\nval note = 1\n`,
    });
  });
  afterAll(() => {
    removeProject(project);
  });
  return {
    get project() {
      return project;
    },
  };
}
export {};
