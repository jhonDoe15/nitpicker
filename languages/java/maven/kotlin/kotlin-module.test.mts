import { describe, expect, it } from 'vitest';
import { kotlinManifest } from './kotlin-module.mts';

describe('The manifest of a Kotlin Maven module', () => {
  it('reports the all-open options, the formatter, the serialization use and the roots relative to the module', () => {
    const module = {
      basedir: '/work/shop',
      buildDirectory: '/work/shop/target',
      outputDirectory: '/work/shop/target/classes',
      testOutputDirectory: '/work/shop/target/test-classes',
      sourceRoots: [],
      testSourceRoots: [],
      kotlin: {
        jdkToolchain: undefined,
        allOpen: { annotations: ['demo.Open'], presets: ['spring'] },
        sourceRoots: ['/work/shop/src/main/kotlin'],
        testSourceRoots: ['/work/shop/src/test/kotlin'],
      },
    };
    const classpaths = {
      mainRuntime: ['/m2/jackson-module-kotlin-2.19.2.jar'],
      mainCompile: [],
      testCompile: [],
    };

    expect(kotlinManifest(module, { formatter: 'ktfmt' }, classpaths)).toEqual({
      kotlin: true,
      kotlinSerialization: true,
      kotlinFormatter: 'ktfmt',
      kotlinAllOpen: { annotations: ['demo.Open'], presets: ['spring'] },
      kotlinSourceRoots: ['src/main/kotlin'],
      kotlinTestSourceRoots: ['src/test/kotlin'],
    });
  });
});
