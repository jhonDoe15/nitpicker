import { describe, expect, it } from 'vitest';
import { jvmOutsideRootsNotices } from './outside-roots-notice.mjs';

const KOTLIN = { preset: 'kotlin' };

describe('jvmOutsideRootsNotices', () => {
  it('names changed sources that no conventional or declared source set covers', () => {
    const files = [
      'app/src/main/java/A.java',
      'app/src/integrationTest/kotlin/B.kt',
      'libs/extra/C.java',
      'tools/D.java',
      'scripts/E.kt',
    ];
    const notice = jvmOutsideRootsNotices(files, { ...KOTLIN, declaredRoots: ['libs/extra'] });

    expect(notice).toHaveLength(1);
    expect(notice[0]).toContain('2 changed Java or Kotlin files are outside');
    expect(notice[0]).toContain('scripts/E.kt, tools/D.java.');
  });

  it('follows the preset: the java preset counts Java files only', () => {
    expect(jvmOutsideRootsNotices(['tools/D.java', 'tools/E.kt'], { preset: 'java' })[0]).toContain(
      '1 changed Java file is outside',
    );
  });

  it('stays quiet for hidden folders, build output, excluded folders and non-source files', () => {
    const files = [
      '.mvn/Wrapper.java',
      'build/generated/A.java',
      'target/classes/B.java',
      'vendor/C.java',
      'build.gradle.kts',
      'README.md',
    ];

    expect(jvmOutsideRootsNotices(files, { ...KOTLIN, exclude: ['vendor/**'] })).toEqual([]);
  });
});
