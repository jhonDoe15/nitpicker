import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../shared/test-support/temp-projects.mts';
import { fieldOf, parseJson, textsOf } from '../../../../shared/values/readers.mts';
import {
  argumentSetOf,
  generatedRoots,
  lookupEntries,
  modulePathEntries,
  ownPackages,
  releaseOf,
  sourceLevelOf,
  withProjectFlags,
  type ArgumentSet,
} from './engine-arguments.mts';
import { ENGINE_CHECKS, engineChecksFor, NULL_AWAY } from './engine-checks.mts';

const REPOSITORY = path.resolve(import.meta.dirname, '../../../..');
const IMMUTABLE = 'Immutable';
const IMMUTABLE_NAMED = ['ImmutableAnnotationChecker', 'ImmutableEnumChecker'];
const IN_REACH = ENGINE_CHECKS.filter((check) => !IMMUTABLE_NAMED.includes(check));
const WITHOUT_NULL_AWAY = IN_REACH.filter((check) => check !== NULL_AWAY);
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

function setOf(head: readonly string[]): ArgumentSet {
  return { head, sources: [] };
}

function headWith(own: string, ...lines: readonly string[]): string[] {
  return ['-d', '/out', '-processorpath', '', `--own-classes=${own}`, ...lines];
}

describe('engineChecksFor', () => {
  it('runs the engine checks on main sources, NullAway on own packages, Immutable ones only in reach', () => {
    const own = classesIn('demo.api', 'demo.api.inner', 'other');

    expect(engineChecksFor(setOf(headWith(own)))).toStrictEqual({
      checks: IN_REACH,
      packages: ['demo.api', 'other'],
    });
  });

  it('runs the engine checks whatever the encoding of the sources', () => {
    const own = classesIn('demo');

    expect(engineChecksFor(setOf(headWith(own, '-encoding', 'ISO-8859-1'))).checks).toStrictEqual(
      IN_REACH,
    );
  });

  it('runs NullAway on the engine with a module path, not on test sources or without own classes', () => {
    const own = classesIn('demo');

    expect(engineChecksFor(setOf(headWith(own, '--test-only')))).toStrictEqual({
      checks: WITHOUT_NULL_AWAY,
      packages: [],
    });
    expect(engineChecksFor(setOf(headWith(path.join(own, 'missing')))).checks).toStrictEqual(
      WITHOUT_NULL_AWAY,
    );
    expect(engineChecksFor(setOf(headWith(own, '--module-path', '/lib.jar')))).toStrictEqual({
      checks: IN_REACH,
      packages: ['demo'],
    });
  });

  it('leaves the checks the project turns off or raises to errors off the engine, the last level winning', () => {
    const head = headWith(
      classesIn('demo'),
      ...[
        '-Xep:SystemOut:OFF',
        '-Xep:EmptyCatch:ERROR',
        '-Xep:JavaUtilDate',
        '-Xep:NullAway:ERROR',
      ],
      ...[
        '-Xep:Other:ERROR',
        '-Xep:FallThrough:OFF',
        '-Xep:FallThrough:WARN',
        `-Xep:${IMMUTABLE}:WARN`,
      ],
    ).map((line) => (line.startsWith('-Xep') ? `--errorprone-flag=${line}` : line));
    const leftOut = ['SystemOut', 'EmptyCatch', NULL_AWAY];

    expect(engineChecksFor(setOf(head))).toStrictEqual({
      checks: ENGINE_CHECKS.filter((check) => !leftOut.includes(check)),
      packages: [],
    });
  });

  it.each([
    [['-Xep:SystemOut:WARN', '-XepDisableAllChecks'], ['UnicodeDirectionalityCharacters']],
    [
      ['-XepDisableAllChecks', '-Xep:SystemOut:WARN'],
      ['SystemOut', 'UnicodeDirectionalityCharacters'],
    ],
  ])('applies %j to the check list as Error Prone does', (flags, checks) => {
    const head = headWith(classesIn('demo'), ...flags.map((flag) => `--errorprone-flag=${flag}`));

    expect(engineChecksFor(setOf(head)).checks).toStrictEqual(checks);
  });

  it('keeps the checks that read a project -XepOpt option on Error Prone', () => {
    const head = headWith(
      classesIn('demo'),
      '--errorprone-flag=-XepOpt:NullAway:ExcludedClasses=demo.A',
      '--errorprone-flag=-XepOpt:IdentifierName:AllowInitialismsInTypeName=true',
    );
    const { checks } = engineChecksFor(setOf(head));

    expect(
      [NULL_AWAY, 'IdentifierName', 'PatternMatchingInstanceof'].filter((check) =>
        checks.includes(check),
      ),
    ).toStrictEqual([]);
    expect(checks).toContain('SystemOut');
  });

  it.each([
    '-XepExcludedPaths:(?i).*/generated/.*',
    '-XepOpt:Unknown:Flag=1',
    '-XepPatchChecks:MissingOverride',
    '-XepIgnoreSuppressionAnnotations',
    '-Xep:SystemOut:LOUD',
    '-Xep:UnicodeDirectionalityCharacters:OFF',
  ])('leaves every check to Error Prone when the project passes %s', (flag) => {
    const head = headWith(
      classesIn('demo'),
      '--errorprone-flag=-Xep:SystemOut:WARN',
      `--errorprone-flag=${flag}`,
    );

    expect(engineChecksFor(setOf(head)).checks).toStrictEqual([]);
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

    expect(engineChecksFor(setOf([...head, `--own-classes=${own}`])).checks).toStrictEqual([]);
  });

  it('moves only checks the engine has and Java runs enable', () => {
    const read = (file: string): unknown =>
      parseJson(readFileSync(path.join(REPOSITORY, file), 'utf8'));
    const checks = read('languages/java/gradle/errorprone/checks.json');
    const ported = textsOf(read('engine/parity/errorprone/ported.json'));
    const disabled = textsOf(fieldOf(checks, 'disable'));

    expect(
      ENGINE_CHECKS.filter((check) => check !== NULL_AWAY).filter(
        (check) => !ported.includes(check),
      ),
    ).toStrictEqual([]);
    expect(ENGINE_CHECKS.filter((check) => disabled.includes(check))).toStrictEqual([]);
  });

  it('moves the checks with class exemptions, Lombok grouping and the one Error Prone cannot switch off', () => {
    expect(
      [
        'IdentifierName',
        'MissingBraces',
        'UnicodeDirectionalityCharacters',
        'HardCodedSdCardPath',
      ].filter((check) => !ENGINE_CHECKS.includes(check)),
    ).toStrictEqual([]);
    expect(
      ENGINE_CHECKS.filter((check) =>
        ['ReferenceEquality', 'UnnecessaryMethodReference'].includes(check),
      ),
    ).toStrictEqual([]);
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

  it('gives the sources, the class and module lookup, the release and the generated roots', () => {
    const { head, sources } = argumentSetOf(text);

    expect(sources).toStrictEqual(['/src/A.java', '/src/B.java']);
    expect(lookupEntries(head)).toStrictEqual(['/a.jar', '/b', '/own']);
    expect(modulePathEntries(head)).toStrictEqual(['/m.jar']);
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

  it('gives the language level from the release, else from the source option', () => {
    const { head } = argumentSetOf(text);
    const sourceOnly = head.filter((line) => !line.startsWith('--release='));

    expect(sourceLevelOf(head)).toBe('17');
    expect(sourceLevelOf([...sourceOnly, '--source=11'])).toBe('11');
    expect(sourceLevelOf(sourceOnly)).toBeUndefined();
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
