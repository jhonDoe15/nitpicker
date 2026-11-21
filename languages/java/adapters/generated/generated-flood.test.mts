import { describe, expect, it } from 'vitest';
import { parseFinding } from '../../../../core/diff/comparison/finding-schema.mts';
import { collapseGeneratedFloods, type FloodFinding } from './generated-flood.mts';

type TestFinding = FloodFinding & {
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
};

function makeFindings(
  files: readonly string[],
  countPerFile: number,
  options: {
    readonly tool?: string;
    readonly rule?: string;
    readonly classification?: string;
  } = {},
): TestFinding[] {
  const tool = options.tool ?? 'pmd';
  const rule = options.rule ?? 'ExcessivePublicCount';
  const classification = options.classification ?? 'enforceable';
  const list: TestFinding[] = [];
  for (const file of files) {
    for (let index = 0; index < countPerFile; index += 1) {
      list.push({
        tool,
        rule,
        path: file,
        identity: `${file}:${String(index)}`,
        message: `Finding ${String(index)}`,
        classification,
      });
    }
  }
  return list;
}

describe('collapseGeneratedFloods', () => {
  it('collapses a per-module rule flood into one schema-valid summary finding', () => {
    const files = Array.from(
      { length: 5 },
      (_, index) =>
        `mall-mbg/src/main/java/com/macro/mall/model/Entity${String(index)}Example.java`,
    );
    const flood = makeFindings(files, 120, { tool: 'checkstyle', rule: 'JavadocMethod' });
    const other: TestFinding = {
      tool: 'pmd',
      rule: 'UnusedLocalVariable',
      path: 'mall-admin/src/main/java/com/macro/mall/AdminController.java',
      identity: 'admin:1',
      message: 'Unused variable',
      classification: 'enforceable',
    };

    const result = collapseGeneratedFloods([...flood, other]);

    expect(result).toHaveLength(2);
    const [summary, kept] = result;
    expect(summary).toEqual({
      tool: 'checkstyle',
      rule: 'JavadocMethod',
      path: 'mall-mbg',
      identity: 'generated-flood:mall-mbg:checkstyle:JavadocMethod',
      message:
        'mall-mbg has 600 JavadocMethod findings across 5 files (120/file) and looks like generated code. Add it to "exclude" or "generatedFiles" in nitpicker.config.json, or narrow the rule.',
      classification: 'enforceable',
    });
    expect(parseFinding(summary)).toMatchObject({
      tool: 'checkstyle',
      rule: 'JavadocMethod',
      path: 'mall-mbg',
    });
    expect(kept).toBe(other);
  });

  it('keeps findings untouched below the file count or average thresholds', () => {
    const fourFiles = Array.from(
      { length: 4 },
      (_, index) => `mall-mbg/src/main/java/com/example/File${String(index)}.java`,
    );
    const fiveFiles = Array.from(
      { length: 5 },
      (_, index) => `mall-mbg/src/main/java/com/example/Low${String(index)}.java`,
    );

    const tooFewFiles = makeFindings(fourFiles, 150);
    const tooLowAverage = makeFindings(fiveFiles, 99);

    expect(collapseGeneratedFloods(tooFewFiles)).toHaveLength(600);
    expect(collapseGeneratedFloods(tooLowAverage)).toHaveLength(495);
  });

  it('never collapses tool-error findings or root-level paths without a module folder', () => {
    const moduleFiles = Array.from(
      { length: 5 },
      (_, index) => `mall-mbg/src/main/java/com/example/Err${String(index)}.java`,
    );
    const rootFiles = Array.from({ length: 5 }, (_, index) => `Root${String(index)}.java`);
    const toolErrors = makeFindings(moduleFiles, 100, { classification: 'tool-error' });
    const rootFindings = makeFindings(rootFiles, 100);
    const dotFindings = makeFindings(['.'], 500);

    expect(collapseGeneratedFloods(toolErrors)).toHaveLength(500);
    expect(collapseGeneratedFloods(rootFindings)).toHaveLength(500);
    expect(collapseGeneratedFloods(dotFindings)).toHaveLength(500);
  });

  it('uses the full prefix before /src/ for nested modules and the first segment otherwise', () => {
    const nestedModuleFiles = Array.from(
      { length: 5 },
      (_, index) => `services/mall-mbg/src/main/java/com/example/Gen${String(index)}.java`,
    );
    const flatFolderFiles = Array.from(
      { length: 5 },
      (_, index) => `generated-code/pkg/Gen${String(index)}.java`,
    );

    const result = collapseGeneratedFloods([
      ...makeFindings(nestedModuleFiles, 100, { rule: 'RuleA' }),
      ...makeFindings(flatFolderFiles, 100, { rule: 'RuleB' }),
    ]);

    expect(result.map(({ path, rule }) => ({ path, rule }))).toEqual([
      { path: 'services/mall-mbg', rule: 'RuleA' },
      { path: 'generated-code', rule: 'RuleB' },
    ]);
  });
});
