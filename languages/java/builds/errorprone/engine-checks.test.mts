import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../shared/test-support/temp-projects.mts';
import { fieldOf, fieldsOf, parseJson, textsOf } from '../../../../shared/values/readers.mts';
import {
  argumentSetOf,
  generatedRoots,
  lookupEntries,
  ownPackages,
  releaseOf,
  withProjectFlags,
} from './engine-arguments.mts';
import { ENGINE_CHECKS, engineChecksFor, NULL_AWAY, TEST_SENSITIVE } from './engine-checks.mts';

const REPOSITORY = path.resolve(import.meta.dirname, '../../../..');
const WITHOUT_NULL_AWAY = ENGINE_CHECKS.filter((check) => check !== NULL_AWAY);
const ON_TEST_SOURCES = WITHOUT_NULL_AWAY.filter((check) => !TEST_SENSITIVE.includes(check));
const projectWith = useTempProjects('nitpicker-errorprone-checks-');

function classesIn(...packages: readonly string[]): string {
  const root = projectWith({});
  for (const name of packages) {
    const directory = path.join(root, 'classes', ...name.split('.'));
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'A.class'), '');
  }
  return path.join(root, 'classes');
}

function headWith(own: string, ...lines: readonly string[]): string[] {
  return ['-d', '/out', '-processorpath', '', `--own-classes=${own}`, ...lines];
}

describe('engineChecksFor', () => {
  it('runs every engine check on main sources, NullAway on the packages of the own classes', () => {
    const own = classesIn('demo.api', 'demo.api.inner', 'other');

    expect(engineChecksFor(headWith(own))).toStrictEqual({
      checks: ENGINE_CHECKS,
      packages: ['demo.api', 'other'],
    });
  });

  it('leaves a source set in another encoding than UTF-8 to Error Prone', () => {
    const own = classesIn('demo');

    expect(engineChecksFor(headWith(own, '-encoding', 'ISO-8859-1')).checks).toStrictEqual([]);
    expect(engineChecksFor(headWith(own, '-encoding', 'utf-8')).checks).toStrictEqual(
      ENGINE_CHECKS,
    );
  });

  it('leaves NullAway to Error Prone on test sources, without own classes and with a module path', () => {
    const own = classesIn('demo');

    expect(engineChecksFor(headWith(own, '--test-only'))).toStrictEqual({
      checks: ON_TEST_SOURCES,
      packages: [],
    });
    expect(engineChecksFor(headWith(path.join(own, 'missing'))).checks).toStrictEqual(
      WITHOUT_NULL_AWAY,
    );
    expect(engineChecksFor(headWith(own, '--module-path', '/lib.jar')).checks).toStrictEqual(
      WITHOUT_NULL_AWAY,
    );
  });

  it('leaves checks that Error Prone treats differently in test code to Error Prone on test sources', () => {
    const watched = ['CheckReturnValue', 'ThrowSpecificExceptions', 'ReturnValueIgnored'];

    expect(ON_TEST_SOURCES.length).toBe(WITHOUT_NULL_AWAY.length - TEST_SENSITIVE.length);
    expect(ON_TEST_SOURCES.filter((check) => watched.includes(check))).toStrictEqual([
      'CheckReturnValue',
    ]);
  });

  it('does not run a check the project switched off', () => {
    const own = classesIn('demo');
    const head = headWith(
      own,
      '--errorprone-flag=-Xep:SystemOut:OFF',
      '--errorprone-flag=-Xep:Other:ERROR',
    );

    expect(engineChecksFor(head).checks).toStrictEqual(
      ENGINE_CHECKS.filter((check) => check !== 'SystemOut'),
    );
  });

  it.each([
    '-XepExcludedPaths:.*/generated/.*',
    '-XepOpt:NullAway:ExcludedClasses=demo.A',
    '-Xep:NullAway:ERROR',
    '-XepPatchChecks:MissingOverride',
  ])('leaves every check to Error Prone when the project passes %s', (flag) => {
    const head = headWith(classesIn('demo'), `--errorprone-flag=${flag}`);

    expect(engineChecksFor(head).checks).toStrictEqual([]);
  });

  it('leaves every check to Error Prone when an annotation processor runs', () => {
    const own = classesIn('demo');
    const processor = path.join(path.dirname(own), 'processor');
    mkdirSync(path.join(processor, 'META-INF/services'), { recursive: true });
    writeFileSync(
      path.join(processor, 'META-INF/services/javax.annotation.processing.Processor'),
      'demo.Processor\n',
    );
    const head = ['-processorpath', ['/missing.jar', processor].join(path.delimiter)];

    expect(engineChecksFor([...head, `--own-classes=${own}`]).checks).toStrictEqual([]);
  });

  it('moves only checks the engine has, that no class annotation exempts and Lombok does not switch off', () => {
    const read = (file: string): unknown =>
      parseJson(readFileSync(path.join(REPOSITORY, file), 'utf8'));
    const checks = read('languages/java/gradle/errorprone/checks.json');
    const ported = textsOf(read('engine/parity/errorprone/ported.json'));
    const special = [
      ...textsOf(fieldOf(checks, 'lombokUnsuppressedOff')),
      ...Object.keys(fieldsOf(fieldOf(checks, 'classExemptions'))),
      ...textsOf(fieldOf(checks, 'disable')),
    ];

    expect(WITHOUT_NULL_AWAY.filter((check) => !ported.includes(check))).toStrictEqual([]);
    expect(ENGINE_CHECKS.filter((check) => special.includes(check))).toStrictEqual([]);
  });
});

describe('the arguments file', () => {
  const text = [
    ...[
      '-d',
      '/out',
      '--module-path',
      '/m.jar',
      '-classpath',
      ['/a.jar', '/b'].join(path.delimiter),
    ],
    ...['--own-classes=/own', '--release=17', '--skip-generated', '--generated-root=/gen'],
    ...['--sources', '/src/A.java', '/src/B.java', ''],
  ].join('\n');

  it('gives the sources, the class lookup, the release and the generated roots', () => {
    const { head, sources } = argumentSetOf(text);

    expect(sources).toStrictEqual(['/src/A.java', '/src/B.java']);
    expect(lookupEntries(head)).toStrictEqual(['/m.jar', '/a.jar', '/b', '/own']);
    expect(releaseOf(head)).toBe('17');
    expect(generatedRoots(head)).toStrictEqual(['/gen']);
    expect(generatedRoots(head.filter((line) => line !== '--skip-generated'))).toStrictEqual([]);
  });

  it('has no release when the project patches a JDK module, as the Error Prone run then compiles', () => {
    const { head } = argumentSetOf(text);
    const exported = [
      '--project-arg=--add-exports',
      '--project-arg=java.base/sun.misc=ALL-UNNAMED',
    ];

    expect(releaseOf([...head, ...exported])).toBeUndefined();
    expect(releaseOf([...head, '--project-arg=--add-exports=demo/demo.api=ALL-UNNAMED'])).toBe(
      '17',
    );
  });

  it('adds project flags before the sources', () => {
    expect(withProjectFlags('-d\n/out\n--sources\n/A.java\n', ['-Xep:SystemOut:OFF'])).toBe(
      '-d\n/out\n--errorprone-flag=-Xep:SystemOut:OFF\n--sources\n/A.java\n',
    );
  });

  it('names the outermost packages that hold classes', () => {
    expect(ownPackages([classesIn('a.b', 'a.b.c', 'a.bc'), '/missing'])).toStrictEqual([
      'a.b',
      'a.bc',
    ]);
  });
});
