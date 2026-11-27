import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { zipOf } from '../../../../../shared/test-support/archives/zip-writer.mts';
import { useTempProjects } from '../../../../../shared/test-support/temp-projects.mts';
import {
  ENABLED_CHECKS,
  hasCheckPlugins,
  immutableInReach,
  lombokUnsuppressed,
  projectLevels,
} from './runner-checks.mts';

const projectWith = useTempProjects('nitpicker-errorprone-runner-checks-');
const SERVICE = 'META-INF/services/com.google.errorprone.bugpatterns.BugChecker';

describe('ENABLED_CHECKS', () => {
  it('holds the checks the runner turns on, without the ones off by default or by choice', () => {
    expect(
      ['FallThrough', 'AnnotationPosition'].filter((check) => ENABLED_CHECKS.includes(check)),
    ).toStrictEqual(['FallThrough', 'AnnotationPosition']);
    expect(ENABLED_CHECKS).not.toContain('AnnotateFormatMethod');
    expect(ENABLED_CHECKS).not.toContain('AddNullMarkedToClass');
  });
});

describe('lombokUnsuppressed', () => {
  it('reads the nearest lombok.config that sets the option or stops bubbling, like the runner', () => {
    const root = projectWith({
      'lombok.config': 'lombok.addSuppressWarnings = false\n',
      'a/A.java': '',
      'b/lombok.config': '  config.stopBubbling = true\n',
      'b/B.java': '',
      'c/lombok.config': 'lombok.addSuppressWarnings = FALSE\nlombok.addSuppressWarnings = true\n',
      'c/C.java': '',
      'd/lombok.config': 'lombok.addSuppressWarnings = true\n',
      'd/D.java': '',
    });
    const file = (name: string): string => path.join(root, name);
    const sources = ['a/A.java', 'b/B.java', 'c/C.java', 'd/D.java'].map(file);

    expect([...lombokUnsuppressed(sources)]).toStrictEqual([file('a/A.java'), file('c/C.java')]);
  });
});

describe('immutableInReach', () => {
  it('finds the annotation on the class path, in a module path jar or named in a source', () => {
    const root = projectWith({
      'dir/com/google/errorprone/annotations/Immutable.class': '',
      'empty/.keep': '',
      'A.java': 'class A {}',
      'B.java': 'import com.google.errorprone.annotations.Immutable;\n@Immutable class B {}',
    });
    const jar = path.join(root, 'annotations.jar');
    writeFileSync(jar, zipOf({ 'com/google/errorprone/annotations/Immutable.class': '' }));
    const broken = path.join(root, 'broken.jar');
    writeFileSync(broken, 'not a zip');
    const a = [path.join(root, 'A.java')];

    expect(immutableInReach(['-classpath', path.join(root, 'empty')], a)).toBe(false);
    expect(immutableInReach(['-classpath', path.join(root, 'dir')], a)).toBe(true);
    expect(immutableInReach(['--module-path', jar], a)).toBe(true);
    expect(immutableInReach(['-classpath', broken], a)).toBe(true);
    expect(immutableInReach([], [...a, path.join(root, 'B.java')])).toBe(true);
  });
});

describe('hasCheckPlugins', () => {
  it('counts checks a processor path entry registers, NullAway aside', () => {
    const root = projectWith({ [`own/${SERVICE}`]: '# checks\ndemo.OwnCheck\n' });
    const nullAway = path.join(root, 'nullaway.jar');
    writeFileSync(
      nullAway,
      zipOf({
        [SERVICE]: 'com.uber.nullaway.NullAway\ncom.uber.nullaway.RequireExplicitNullMarking\n',
      }),
    );
    const plugin = path.join(root, 'plugin.jar');
    writeFileSync(plugin, zipOf({ [SERVICE]: 'demo.Check\n' }));

    expect(hasCheckPlugins(['-processorpath', nullAway])).toBe(false);
    expect(hasCheckPlugins(['-processorpath', [nullAway, plugin].join(path.delimiter)])).toBe(true);
    expect(hasCheckPlugins(['-processorpath', path.join(root, 'own')])).toBe(true);
    expect(hasCheckPlugins([])).toBe(false);
  });
});

describe('projectLevels', () => {
  it('splits the checks the project turns on from those it turns off, the last flag winning', () => {
    const head = ['-Xep:A', '-Xep:B:WARN', '-Xep:C:OFF', '-Xep:D:OFF', '-Xep:D:ERROR'].map(
      (flag) => `--errorprone-flag=${flag}`,
    );

    expect(projectLevels(head)).toStrictEqual({
      on: new Set(['A', 'B', 'D']),
      off: new Set(['C']),
    });
  });
});
