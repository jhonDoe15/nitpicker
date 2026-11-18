import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fieldOf, parseJson } from '../../../../shared/values/readers.mts';
import { useGeneratedGradleProject } from './test-support/generated-gradle-project.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const CLASSES = ['Written', 'Made', 'Only'];

describe.skipIf(!enabled)('a Gradle build with generated source roots', () => {
  const project = useGeneratedGradleProject(gradle);

  beforeAll(() => {
    project.prepare();
  }, 300_000);

  afterAll(() => {
    project.cleanup();
  });

  it.each(['pmd.sarif', 'spotbugs.sarif', 'errorprone.json'])(
    'names the hand-written class and no generated one in %s',
    (name) => {
      const named = project
        .reportTexts(name)
        .flatMap(({ text }) => CLASSES.filter((className) => text.includes(className)));

      expect(named).toEqual(['Written']);
    },
  );

  it.each(['pmd.sarif', 'spotbugs.sarif'])(
    'writes an empty %s for a module whose sources are all generated',
    (name) => {
      const runs = project
        .reportTexts(name)
        .filter(({ file }) => file.includes('only-generated'))
        .map(({ text }) => fieldOf(parseJson(text), 'runs'));

      expect(runs).toEqual([[]]);
    },
  );
});
