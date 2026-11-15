import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mts';
import { commit } from '../../diff/git/test-support/git-repository.mts';
import { enforceableFindings, stringMatching } from '../test-support/report-readers.mts';
import type { PresetRun } from '../test-support/fixture-types.mts';
import { fieldOf } from '../../../shared/values/readers.mts';
import { useGradleFixtures } from './test-support/java-cli-harness.mts';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mts';

const { kotlinRepository, run } = useGradleFixtures(nitpickerCli);

describe('nitpicker with "preset": "kotlin" and function structure', () => {
  const wideFunction = (name: string, parameters: number, start: number) => ({
    file: 'src/main/kotlin/demo/Wide.kt',
    name,
    start,
    end: start,
    lines: 1,
    statements: 1,
    maxControlNesting: 0,
    parameters,
    complexity: 1,
  });
  const wideSource = (...signatures: readonly string[]) =>
    `package demo\n\n${signatures.map((signature) => `fun ${signature} = 0\n`).join('\n')}`;
  const metricsOf = (...functions: readonly object[]) =>
    `${JSON.stringify({ functions, files: [] })}\n`;
  const newEnforceable = (result: Pick<PresetRun, 'json'>, tool: string) =>
    enforceableFindings(result.json('new-findings.json')).filter(
      (finding) => fieldOf(finding, 'tool') === tool,
    );
  const FOUR_PARAMETERS = 'sum(a: Int, b: Int, c: Int, d: Int)';
  const legacyWide = () =>
    kotlinRepository({
      'src/main/kotlin/demo/Wide.kt': wideSource(FOUR_PARAMETERS),
      'kotlin-metrics.json': metricsOf(wideFunction('sum', 4, 3)),
    });
  it('keeps a Kotlin function over the parameter limit baselined when it only moves', () => {
    const root = legacyWide();
    writeFiles(root, {
      'src/main/kotlin/demo/Wide.kt': `package demo\n\nval answer = 1\n\nfun ${FOUR_PARAMETERS} = 0\n`,
      'kotlin-metrics.json': metricsOf(wideFunction('sum', 4, 5)),
    });
    commit(root, 'move the function');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
  });
  it('fails a Kotlin function that grows past the parameter limit it already exceeded', () => {
    const root = legacyWide();
    writeFiles(root, {
      'src/main/kotlin/demo/Wide.kt': wideSource('sum(a: Int, b: Int, c: Int, d: Int, e: Int)'),
      'kotlin-metrics.json': metricsOf(wideFunction('sum', 5, 3)),
    });
    commit(root, 'add a parameter');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(newEnforceable(result, 'structure')).toEqual([
      {
        tool: 'structure',
        rule: 'function-parameters-limit',
        path: 'src/main/kotlin/demo/Wide.kt',
        identity: 'function:sum:occurrence:1:source:88a9edab7be3d0a022e4137e',
        message:
          'sum grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another. If this is intended, add {"rule":"function-parameters-limit","paths":["src/main/kotlin/demo/Wide.kt"],"function":"sum","reason":"..."} to "exceptions" in nitpicker.config.json.',
        allowedForm: 'Group related parameters into one object instead of adding another.',
        exception: {
          rule: 'function-parameters-limit',
          paths: ['src/main/kotlin/demo/Wide.kt'],
          function: 'sum',
          reason: '...',
        },
        exceptionList: 'exceptions',
        classification: 'enforceable',
        symbol: 'sum',
        anchor: { key: stringMatching(/^function:parameters:text:/u) },
        location: { line: 3 },
        ratchet: {
          key: 'function:sum:occurrence:1:parameters',
          declarationKey: stringMatching(/^function:\w+:declaration:\w+:parameters$/u),
          value: 5,
          worseMessage:
            'sum grew from {base} to 5 parameters (limit 3). Group related parameters into one object instead of adding another. If this is intended, add {"rule":"function-parameters-limit","paths":["src/main/kotlin/demo/Wide.kt"],"function":"sum","reason":"..."} to "exceptions" in nitpicker.config.json.',
          worseAllowedForm: 'Group related parameters into one object instead of adding another.',
          heldMessage:
            'sum: 5 parameters (limit 3), allowed because base was {base}; any increase fails.',
        },
      },
    ]);
  });
  it('fails a new Kotlin function over the parameter limit', () => {
    const root = legacyWide();
    writeFiles(root, {
      'src/main/kotlin/demo/Wide.kt': wideSource(
        FOUR_PARAMETERS,
        'product(a: Int, b: Int, c: Int, d: Int)',
      ),
      'kotlin-metrics.json': metricsOf(wideFunction('sum', 4, 3), wideFunction('product', 4, 5)),
    });
    commit(root, 'add a function');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(newEnforceable(result, 'structure')).toEqual([
      {
        tool: 'structure',
        rule: 'function-parameters-limit',
        path: 'src/main/kotlin/demo/Wide.kt',
        identity: 'function:product:occurrence:1:source:4028b70dcfd552e455558543',
        message:
          'product has 4 parameters; limit is 3. If this is intended, add {"rule":"function-parameters-limit","paths":["src/main/kotlin/demo/Wide.kt"],"function":"product","reason":"..."} to "exceptions" in nitpicker.config.json.',
        exception: {
          rule: 'function-parameters-limit',
          paths: ['src/main/kotlin/demo/Wide.kt'],
          function: 'product',
          reason: '...',
        },
        exceptionList: 'exceptions',
        classification: 'enforceable',
        symbol: 'product',
        anchor: { key: stringMatching(/^function:parameters:text:/u) },
        location: { line: 5 },
        ratchet: {
          key: 'function:product:occurrence:1:parameters',
          declarationKey: stringMatching(/^function:\w+:declaration:\w+:parameters$/u),
          value: 4,
          worseMessage:
            'product grew from {base} to 4 parameters (limit 3). Group related parameters into one object instead of adding another. If this is intended, add {"rule":"function-parameters-limit","paths":["src/main/kotlin/demo/Wide.kt"],"function":"product","reason":"..."} to "exceptions" in nitpicker.config.json.',
          worseAllowedForm: 'Group related parameters into one object instead of adding another.',
          heldMessage:
            'product: 4 parameters (limit 3), allowed because base was {base}; any increase fails.',
        },
      },
    ]);
  });
  it('fails a new Kotlin clone found by jscpd', () => {
    const root = kotlinRepository();
    const clone = (name: string) =>
      `package demo\n\nclass ${name} {\n    fun total(a: Int, b: Int): Int {\n        var total = 0\n${Array.from(
        { length: 10 },
        (_, index) =>
          `        total += (a * ${String(index + 2)}) + (b - ${String(index)})\n        if (total > ${String(index * 10)}) {\n            total -= ${String(index + 1)}\n        }\n`,
      ).join('')}        return total\n    }\n}\n`;
    writeFiles(root, {
      'src/main/kotlin/demo/Left.kt': clone('Left'),
      'src/main/kotlin/demo/Right.kt': clone('Right'),
    });
    commit(root, 'copy a class');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(newEnforceable(result, 'duplicates')).toEqual([
      {
        tool: 'duplicates',
        rule: 'duplicate-clone',
        path: 'src/main/kotlin/demo/Left.kt',
        identity:
          'pair:src/main/kotlin/demo/Left.kt|src/main/kotlin/demo/Right.kt:fragment:36d1c9baac959e2d7350e29b:occurrence:1',
        message:
          'This code repeats src/main/kotlin/demo/Right.kt:3 (46 lines). Keep one copy and call it from both places. If the repetition is intended, add src/main/kotlin/demo/Left.kt or src/main/kotlin/demo/Right.kt to "exclude" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 3 },
        ratchet: {
          key: 'pair:src/main/kotlin/demo/Left.kt|src/main/kotlin/demo/Right.kt:clone',
          value: 283,
          divisible: true,
          mustKeepUnchangedLines: [
            { path: 'src/main/kotlin/demo/Left.kt', startLine: 3, endLine: 48 },
            { path: 'src/main/kotlin/demo/Right.kt', startLine: 3, endLine: 48 },
          ],
        },
      },
    ]);
  });
  it('fails a Kotlin copy whose locals, names and literals were all renamed', () => {
    const root = kotlinRepository();
    writeFiles(root, {
      'src/main/kotlin/demo/Invoice.kt': renamedCopy(INVOICE_NAMES, [0, 100, 1000, 10]),
      'src/main/kotlin/demo/Parcel.kt': renamedCopy(PARCEL_NAMES, [1, 10, 5000, 50]),
    });
    commit(root, 'copy and rename a class');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(newEnforceable(result, 'duplicates')).toEqual([
      {
        tool: 'duplicates',
        rule: 'duplicate-clone',
        path: 'src/main/kotlin/demo/Invoice.kt',
        identity:
          'renamed:pair:src/main/kotlin/demo/Invoice.kt|src/main/kotlin/demo/Parcel.kt:fragment:5ce5c62d2497fde3b14189bb:occurrence:1',
        message:
          'This code repeats src/main/kotlin/demo/Parcel.kt:3 (17 lines). Keep one copy and call it from both places. If the repetition is intended, add src/main/kotlin/demo/Invoice.kt or src/main/kotlin/demo/Parcel.kt to "exclude" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 3 },
        ratchet: {
          key: 'pair:src/main/kotlin/demo/Invoice.kt|src/main/kotlin/demo/Parcel.kt:clone',
          value: 131,
          divisible: true,
          mustKeepUnchangedLines: [
            { path: 'src/main/kotlin/demo/Invoice.kt', startLine: 3, endLine: 19 },
            { path: 'src/main/kotlin/demo/Parcel.kt', startLine: 3, endLine: 19 },
          ],
        },
      },
    ]);
  });
  it('lifts a renamed Kotlin clone when either file of the pair is excluded', () => {
    const root = kotlinRepository({
      'nitpicker.config.json': `${JSON.stringify({
        preset: 'kotlin',
        exclude: ['src/main/kotlin/demo/Parcel.kt'],
      })}\n`,
      'src/main/kotlin/demo/Parcel.kt': renamedCopy(PARCEL_NAMES, [1, 10, 5000, 50]),
    });
    writeFiles(root, {
      'src/main/kotlin/demo/Invoice.kt': renamedCopy(INVOICE_NAMES, [0, 100, 1000, 10]),
    });
    commit(root, 'copy and rename a class');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
  });
  it('stays quiet for short functions, imports, data classes, tables and generated files', () => {
    const root = kotlinRepository();
    writeFiles(root, {
      'src/main/kotlin/demo/short/Short.kt': `package demo\n\nfun area(w: Int, h: Int): Int {\n    return w * h\n}\n`,
      'src/main/kotlin/demo/short/Small.kt': `package demo\n\nfun size(a: Int, b: Int): Int {\n    return a * b\n}\n`,
      'src/main/kotlin/demo/imports/ImportsA.kt': importList([
        'alpha',
        'beta',
        'gamma',
        'delta',
        'epsilon',
      ]),
      'src/main/kotlin/demo/imports/ImportsB.kt': importList([
        'eta',
        'theta',
        'iota',
        'kappa',
        'lambda',
      ]),
      'src/main/kotlin/demo/dto/PersonDto.kt': dataClass('Person', 'name', 'city'),
      'src/main/kotlin/demo/dto/PlaceDto.kt': dataClass('Place', 'title', 'region'),
      'src/main/kotlin/demo/tables/TableA.kt': lookupTable('alpha'),
      'src/main/kotlin/demo/tables/TableB.kt': lookupTable('beta'),
      'src/main/kotlin/demo/generated/GeneratedA.kt': `// @generated\n${renamedCopy(INVOICE_NAMES, [0, 100, 1000, 10])}`,
      'src/main/kotlin/demo/generated/GeneratedB.kt': `// @generated\n${renamedCopy(PARCEL_NAMES, [1, 10, 5000, 50])}`,
    });
    commit(root, 'add similar but legitimate files');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(newEnforceable(result, 'duplicates')).toEqual([]);
  });
});

const INVOICE_NAMES = {
  type: 'Invoice',
  fn: 'total',
  list: 'lines',
  sum: 'subtotal',
  item: 'line',
};
const PARCEL_NAMES = {
  type: 'Parcel',
  fn: 'weigh',
  list: 'boxes',
  sum: 'accumulated',
  item: 'box',
};

type CopyNames = {
  readonly type: string;
  readonly fn: string;
  readonly list: string;
  readonly sum: string;
  readonly item: string;
};

function renamedCopy(
  names: CopyNames,
  [low, scale, limit, discount]: readonly [number, number, number, number],
): string {
  return `package demo

class ${names.type} {
    fun ${names.fn}(${names.list}: List<Entry>, factor: Int): Int {
        var ${names.sum} = ${String(low)}
        for (${names.item} in ${names.list}) {
            if (${names.item}.price > ${String(low)} && ${names.item}.count > ${String(low)}) {
                ${names.sum} += ${names.item}.price * ${names.item}.count * factor
            } else if (${names.item}.price < ${String(low)}) {
                ${names.sum} -= Math.abs(${names.item}.price) * ${names.item}.count
            }
            if (${names.sum} > ${String(limit)}) {
                ${names.sum} = ${names.sum} - ${String(discount)}
            }
        }
        val rounded = Math.round(${names.sum} * ${String(scale)}.0) / ${String(scale)}
        return if (rounded > ${String(limit)}) rounded - ${String(discount)} else rounded.toInt()
    }
}
`;
}

function importList(names: readonly string[]): string {
  const imports = names.flatMap((name) => [`import demo.${name}.One`, `import demo.${name}.Two`]);
  return `package demo\n\n${imports.join('\n')}\n`;
}

function dataClass(name: string, first: string, second: string): string {
  const fields = Array.from(
    { length: 12 },
    (_, index) => `    val ${first}${String(index)}: String = "",`,
  );
  return `package demo\n\ndata class ${name}(\n${fields.join('\n')}\n    val ${second}: Int = 0,\n)\n`;
}

function lookupTable(prefix: string): string {
  const rows = Array.from(
    { length: 30 },
    (_, index) => `    "${prefix}${String(index)}" to ${String(index * 7)},`,
  );
  return `package demo\n\nval ${prefix}Table = mapOf(\n${rows.join('\n')}\n)\n`;
}
