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

    expect(notice).toEqual([
      "2 changed Java or Kotlin files are outside the build's source sets, so the build does not compile " +
        'or check them: scripts/E.kt, tools/D.java. Move them under src/main or src/test of a module, ' +
        'or declare their folders as a source directory in the build file; to leave them unchecked, ' +
        'list them in "exclude" in nitpicker.config.json.',
    ]);
  });

  it('follows the preset: the java preset counts Java files only', () => {
    expect(jvmOutsideRootsNotices(['tools/D.java', 'tools/E.kt'], { preset: 'java' })).toEqual([
      "1 changed Java file is outside the build's source sets, so the build does not compile or check it: " +
        'tools/D.java. Move it under src/main or src/test of a module, or declare its folder as a source ' +
        'directory in the build file; to leave it unchecked, list it in "exclude" in nitpicker.config.json.',
    ]);
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
