import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../../shared/test-support/temp-projects.mts';
import {
  excludedFile,
  handedBack,
  mayBeGenerated,
  optionReaders,
  unsupportedOption,
} from './project-options.mts';

const projectWith = useTempProjects('nitpicker-errorprone-options-');

function flags(...values: readonly string[]): string[] {
  return values.map((value) => `--errorprone-flag=${value}`);
}

describe('unsupportedOption', () => {
  it('follows check levels, global flags, excluded paths, generated code and known -XepOpt options', () => {
    const head = flags(
      '-Xep:SystemOut',
      '-Xep:FallThrough:OFF',
      '-XepAllDisabledChecksAsWarnings',
      '-XepDisableWarningsInGeneratedCode',
      '-XepIgnoreUnknownCheckNames',
      '-XepExcludedPaths:.*/(?:build|target)/generated[^/]*/.*\\.java',
      '-XepOpt:NullAway:AnnotatedPackages=demo',
      '-XepOpt:Javadoc:customBlockTags=apiNote',
    );

    expect(unsupportedOption(head)).toBeUndefined();
  });

  it.each([
    '-XepExcludedPaths:(?i).*/gen/.*',
    '-XepExcludedPaths:.*\\Q.java\\E',
    '-XepExcludedPaths:a++',
    '-XepExcludedPaths:.*/my dir/.*',
    '-XepOpt:constructor=1',
    '-XepOpt:Made:Up=1',
    '-Xep:SystemOut:LOUD',
    '-Xep:A:B:OFF',
    '-XepPatchChecks:MissingOverride',
    '-XepCompilingPubliclyVisibleCode',
  ])('names %s', (flag) => {
    expect(unsupportedOption(flags('-Xep:SystemOut:WARN', flag))).toBe(flag);
  });
});

describe('optionReaders', () => {
  it('names the checks that read the options, through shared helpers too', () => {
    const readers = optionReaders(
      flags('-XepOpt:Javadoc:customInlineTags', '-XepOpt:NullAway:CastToNonNullMethod=x'),
    );

    expect([...readers].toSorted()).toStrictEqual([
      'InvalidBlockTag',
      'InvalidInlineTag',
      'JSpecifyUnrecognizedAnnotationLocation',
      'NullAway',
      'RequireExplicitNullMarking',
    ]);
  });
});

describe('excludedFile', () => {
  it('matches the whole absolute path, the last pattern alone unless the runner joins them', () => {
    const head = flags('-XepExcludedPaths:.*/a/.*', '-XepExcludedPaths:.*/b/.*');
    const excluded = excludedFile(head);
    const joined = excludedFile(['-s', '/gen', ...head]);

    expect([excluded('/p/a/A.java'), excluded('/p/b/B.java'), excluded('b/B.java')]).toStrictEqual([
      false,
      true,
      true,
    ]);
    expect([joined('/p/a/A.java'), joined('/p/b/B.java'), joined('/p/c/C.java')]).toStrictEqual([
      true,
      true,
      false,
    ]);
    expect(excludedFile([])('/p/a/A.java')).toBe(false);
  });
});

describe('handedBack', () => {
  it('gives the engine checks below error level back in files that may hold generated code', () => {
    const root = projectWith({
      'A.java': '@javax.annotation.processing.Generated("x") class A {}',
      'B.java': 'class B {}',
    });
    const [a, b] = ['A.java', 'B.java'].map((name) => path.join(root, name));
    const rows = [
      { rule: 'SystemOut', file: a ?? '' },
      { rule: 'FallThrough', file: a ?? '' },
      { rule: 'SystemOut', file: a ?? '' },
      { rule: 'UnicodeDirectionalityCharacters', file: a ?? '' },
      { rule: 'SystemOut', file: b ?? '' },
    ];
    const levels = new Map([
      ['SystemOut', 'WARNING' as const],
      ['FallThrough', 'SUGGESTION' as const],
      ['UnicodeDirectionalityCharacters', 'ERROR' as const],
    ]);

    expect(
      handedBack({ head: flags('-XepDisableWarningsInGeneratedCode') }, rows, levels),
    ).toStrictEqual(new Map([[a, ['SystemOut', 'FallThrough']]]));
    expect(handedBack({ head: [] }, rows, levels)).toStrictEqual(new Map());
    const wide = handedBack(
      { head: ['-encoding', 'UTF-16', ...flags('-XepDisableWarningsInGeneratedCode')] },
      rows,
      levels,
    );
    expect(wide.get(b ?? '')).toStrictEqual(['SystemOut']);
    expect([
      mayBeGenerated('@Generated class A {}'),
      mayBeGenerated('class NotGeneratedHere {}'),
    ]).toStrictEqual([true, false]);
  });
});
