import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../core/diff/comparison/compare.mts';
import { parseFinding } from '../../../core/diff/comparison/finding-schema.mts';
import type { Finding } from '../../values/findings.mts';
import { classLimitFindings } from './class-limits.mts';
import { folderDepthFindings } from './folder-depth.mts';

type DepthOptions = Parameters<typeof folderDepthFindings>[1];
type DepthFile = Parameters<typeof folderDepthFindings>[0][number];
type ClassEntry = Parameters<typeof classLimitFindings>[0][number];
type ClassOptions = Parameters<typeof classLimitFindings>[1];
type Overrides = Readonly<Record<string, unknown>>;

const WORDING = {
  subject: 'Folder',
  below: 'the root',
  advice: (limit: number) => `Keep it ${String(limit)} deep.`,
};
function HINT(rule: string, glob: string): string {
  return `If this is intended, add {"rule":"${rule}","paths":["${glob}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`;
}

function depthOf({ path }: DepthFile): number {
  return path.split('/').length - 2;
}

function depthFindings(
  files: readonly DepthFile[],
  options: Partial<DepthOptions> = {},
): Finding[] {
  return folderDepthFindings(files, {
    analyzerName: 'structure',
    limit: 1,
    wording: WORDING,
    depthOf,
    ...options,
  });
}

function source(path: string): DepthFile {
  return { path, kind: 'source' };
}

function parsed(findings: readonly Finding[]): ReturnType<typeof parseFinding>[] {
  return findings.map((finding) => parseFinding(finding));
}

describe('folder depth', () => {
  it('fails a folder deeper than the limit, once per kind of file, not one at the limit', () => {
    const findings = depthFindings([
      source('root/a/x.ts'),
      source('root/a/b/c/x.ts'),
      source('root/a/b/c/y.ts'),
      { path: 'root/a/b/c/x.test.ts', kind: 'test' },
    ]);
    expect(findings.map(({ rule, path, identity }) => [rule, path, identity])).toEqual([
      ['folder-depth-limit', 'root/a/b/c', 'folder-depth:source:3'],
      ['folder-depth-limit', 'root/a/b/c', 'folder-depth:test:3'],
    ]);
    expect(findings[0]?.message).toBe(
      `Folder is 3 levels below the root (limit 1). Keep it 1 deep. ${HINT('folder-depth-limit', 'root/a/b/c/**')}`,
    );
    expect(findings[0]?.['ratchet']).toEqual({
      key: 'folder-depth:source',
      value: 3,
      worseAllowedForm: 'Keep it 1 deep.',
      worseMessage: `Folder grew from {base} to 3 levels below the root (limit 1). Keep it 1 deep. ${HINT('folder-depth-limit', 'root/a/b/c/**')}`,
      heldMessage:
        'Folder: 3 levels below the root (limit 1), allowed because base was {base}; any increase fails.',
      pathIsFolder: true,
      folderFiles: 2,
    });
  });

  it('skips files the language does not cover, test data and excepted files', () => {
    const files = [
      { path: 'root/a/b/c/data.ts', kind: 'test' },
      source('root/a/b/c/d.ts'),
      source('root/a/b/e/f.ts'),
      source('x.ts'),
    ];
    const found = depthFindings([{ path: 'root/__fixtures__/a/b/c.ts', kind: 'test' }, ...files], {
      depthOf: ({ path }) => (path === 'x.ts' ? undefined : depthOf({ path })),
      exceptions: [{ rule: 'folder-depth-limit', paths: ['root/a/b/e/**'] }],
    });
    expect(found.map(({ path }) => path)).toEqual(['root/a/b/c', 'root/a/b/c']);
    expect(
      depthFindings(files, {
        exceptions: [{ rule: 'folder-depth-limit', paths: ['root/a/b/**'] }],
      }),
    ).toEqual([]);
  });

  describe('against the base', () => {
    function compare(
      baseFiles: readonly DepthFile[],
      headFiles: readonly DepthFile[],
      renames: readonly (readonly [string, string])[] = [],
    ): ReturnType<typeof compareFindings> {
      return compareFindings({
        baseFindings: parsed(depthFindings(baseFiles)),
        headFindings: parsed(depthFindings(headFiles)),
        touchedCode: undefined,
        baseToHeadRenames: new Map(renames),
      });
    }
    function messages(result: ReturnType<typeof compareFindings>): string[] {
      return result.newFindings.map(({ message }) => message);
    }

    it('holds a legacy deep folder, and fails it only when it gets deeper', () => {
      const base = [source('r/a/b/c/x.ts')];
      expect(compare(base, [source('r/a/b/c/x.ts'), source('r/a/b/c/y.ts')]).newFindings).toEqual(
        [],
      );
      expect(compare(base, [source('r/a/x.ts')]).newFindings).toEqual([]);
      expect(messages(compare(base, [source('r/a/b/c/d/x.ts')]))).toEqual([
        `Folder is 4 levels below the root (limit 1). Keep it 1 deep. ${HINT('folder-depth-limit', 'r/a/b/c/d/**')}`,
      ]);
    });

    it('fails a new deep folder next to a legacy one, and follows a moved folder', () => {
      const base = [source('r/a/b/c/x.ts')];
      expect(
        compare(base, [source('r/a/b/c/x.ts'), source('r/q/w/e/x.ts')]).newFindings.map(
          ({ path }) => path,
        ),
      ).toEqual(['r/q/w/e']);
      expect(
        compare(base, [source('r/n/b/c/x.ts')], [['r/a/b/c/x.ts', 'r/n/b/c/x.ts']]).newFindings,
      ).toEqual([]);
    });
  });
});

function entry(overrides: Overrides): ClassEntry {
  return {
    file: 'src/main/java/A.java',
    name: 'A',
    kind: 'class',
    start: 3,
    methods: 1,
    fields: 1,
    inheritanceDepth: 0,
    ...overrides,
  };
}

function classFindings(
  classes: readonly ClassEntry[],
  options: Partial<ClassOptions> = {},
): Finding[] {
  return classLimitFindings(classes, { analyzerName: 'structure', ...options });
}

describe('class limits', () => {
  it('fails a class over a limit with the allowed form, and not one at the limits', () => {
    const findings = classFindings([
      entry({ name: 'Ok', methods: 20, fields: 10, inheritanceDepth: 3 }),
      entry({ name: 'Big', methods: 21, fields: 11, inheritanceDepth: 4 }),
    ]);
    expect(findings.map(({ rule, identity }) => [rule, identity])).toEqual([
      ['class-methods-limit', 'methods:Big:occurrence:1:21'],
      ['class-fields-limit', 'fields:Big:occurrence:1:11'],
      ['inheritance-depth-limit', 'inheritanceDepth:Big:occurrence:1:4'],
    ]);
    const file = 'src/main/java/A.java';
    expect(findings.map(({ message }) => message)).toEqual([
      `Class Big has 21 methods (limit 20). Split it into classes by responsibility. ${HINT('class-methods-limit', file)}`,
      `Class Big has 11 fields (limit 10). Group related fields into a record or a class of their own. ${HINT('class-fields-limit', file)}`,
      `Class Big extends 4 classes deep (limit 3). Hold the shared part as a field and delegate to it instead of extending. ${HINT('inheritance-depth-limit', file)}`,
    ]);
    expect(findings[0]?.location).toEqual({ line: 3 });
  });

  it('takes the limits from thresholds and names the kind of type', () => {
    const findings = classFindings([entry({ kind: 'record', name: 'R', fields: 3, methods: 2 })], {
      thresholds: { classFields: 2, classMethods: 2 },
    });
    expect(findings.map(({ message }) => message.split('.')[0])).toEqual([
      'Record R has 3 components (limit 2)',
    ]);
  });

  it('lifts a limit for the files an exception names, and numbers repeated names', () => {
    const big: Overrides = { methods: 30 };
    expect(
      classFindings([entry(big)], {
        exceptions: [{ rule: 'class-methods-limit', paths: ['src/main/**'] }],
      }),
    ).toEqual([]);
    expect(
      classFindings([entry(big)], {
        exceptions: [{ rule: 'class-fields-limit', paths: ['src/main/**'] }],
      }),
    ).toHaveLength(1);
    expect(classFindings([entry(big), entry(big)]).map(({ identity }) => identity)).toEqual([
      'methods:A:occurrence:1:30',
      'methods:A:occurrence:2:30',
    ]);
  });

  it('keeps a legacy class held when it is renamed with its file, or others are added and removed', () => {
    function compare(
      base: readonly ClassEntry[],
      head: readonly ClassEntry[],
      renames = new Map<string, string>(),
    ): ReturnType<typeof compareFindings> {
      return compareFindings({
        baseFindings: parsed(classFindings(base)),
        headFindings: parsed(classFindings(head)),
        touchedCode: undefined,
        baseToHeadRenames: renames,
      });
    }
    const renamed = new Map([['src/main/java/Old.java', 'src/main/java/New.java']]);
    const old = entry({ file: 'src/main/java/Old.java', name: 'Old', methods: 25 });
    const moved = entry({ file: 'src/main/java/New.java', name: 'New', methods: 25 });

    expect(compare([old], [moved], renamed).newFindings).toEqual([]);
    expect(compare([old], [{ ...moved, methods: 26 }], renamed).newFindings).toHaveLength(1);
    const two = [entry({ name: 'First', methods: 25 }), entry({ name: 'Second', methods: 30 })];
    const reordered = [
      entry({ name: 'Second', methods: 30, start: 3 }),
      entry({ name: 'First', methods: 25, start: 50 }),
    ];
    expect(compare(two, reordered).newFindings).toEqual([]);
    const grown = [entry({ name: 'First', methods: 26 }), entry({ name: 'Second', methods: 30 })];
    expect(compare(two, grown).newFindings.map(({ message }) => message.split(' ')[1])).toEqual([
      'First',
    ]);
  });

  it('holds a legacy class and fails it only when it grows', () => {
    function compare(base: number, head: number): ReturnType<typeof compareFindings> {
      return compareFindings({
        baseFindings: parsed(classFindings([entry({ methods: base })])),
        headFindings: parsed(classFindings([entry({ methods: head, start: 40 })])),
        touchedCode: undefined,
      });
    }
    expect(compare(25, 25).newFindings).toEqual([]);
    expect(compare(25, 22).newFindings).toEqual([]);
    expect(compare(25, 26).newFindings.map(({ message }) => message)).toEqual([
      `Class A grew from 25 to 26 methods (limit 20). Put the new method in a new class. ${HINT('class-methods-limit', 'src/main/java/A.java')}`,
    ]);
  });
});
