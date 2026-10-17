import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { commit } from '../../diff/git/test-support/git-repository.mjs';
import { useGradleFixtures } from './test-support/java-cli-harness.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';

const { kotlinRepository, run } = useGradleFixtures(nitpickerCli);

describe('nitpicker with "preset": "kotlin" and function structure', () => {
  const wideFunction = (name, parameters, start) => ({
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
  const wideSource = (...signatures) =>
    `package demo\n\n${signatures.map((signature) => `fun ${signature} = 0\n`).join('\n')}`;
  const metricsOf = (...functions) => `${JSON.stringify({ functions, files: [] })}\n`;
  const newEnforceable = (result, tool) =>
    result
      .json('new-findings.json')
      .filter((finding) => finding.tool === tool && finding.classification === 'enforceable');
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
          'sum grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another.',
        classification: 'enforceable',
        symbol: 'sum',
        location: { line: 3 },
        ratchet: {
          key: 'function:sum:occurrence:1:parameters',
          value: 5,
          worseMessage:
            'sum grew from {base} to 5 parameters (limit 3). Group related parameters into one object instead of adding another.',
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
        message: 'product has 4 parameters; limit is 3',
        classification: 'enforceable',
        symbol: 'product',
        location: { line: 5 },
        ratchet: {
          key: 'function:product:occurrence:1:parameters',
          value: 4,
          worseMessage:
            'product grew from {base} to 4 parameters (limit 3). Group related parameters into one object instead of adding another.',
          heldMessage:
            'product: 4 parameters (limit 3), allowed because base was {base}; any increase fails.',
        },
      },
    ]);
  });
  it('fails a new Kotlin clone found by jscpd', () => {
    const root = kotlinRepository();
    const clone = (name) =>
      `package demo\n\nclass ${name} {\n    fun total(a: Int, b: Int): Int {\n        var total = 0\n${Array.from(
        { length: 10 },
        (_, index) =>
          `        total += (a * ${index + 2}) + (b - ${index})\n        if (total > ${index * 10}) {\n            total -= ${index + 1}\n        }\n`,
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
        identity: expect.stringMatching(
          /^renamed:pair:src\/main\/kotlin\/demo\/Left\.kt\|src\/main\/kotlin\/demo\/Right\.kt:/u,
        ),
        message: expect.stringContaining(
          'This code repeats src/main/kotlin/demo/Right.kt:3 (46 lines). Keep one copy and call it from both places. If this is intended, add {"rule":"duplicates/duplicate-clone","paths":["src/main/kotlin/demo/Left.kt"]',
        ),
        classification: 'enforceable',
        location: { line: 3 },
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
    const found = newEnforceable(result, 'duplicates');
    expect(found.map(({ path, rule }) => `${rule} ${path}`)).toEqual([
      'duplicate-clone src/main/kotlin/demo/Invoice.kt',
    ]);
    expect(found[0].identity).toMatch(/^renamed:pair:/u);
    expect(found[0].message).toContain('Keep one copy and call it from both places. If this is');
  });
  it('lifts a renamed Kotlin clone with an exception for duplicates/duplicate-clone', () => {
    const root = kotlinRepository({
      'nitpicker.config.json': `${JSON.stringify({
        preset: 'kotlin',
        exceptions: [
          {
            rule: 'duplicates/duplicate-clone',
            paths: ['src/main/kotlin/demo/Invoice.kt'],
            reason: 'copied on purpose',
          },
        ],
      })}\n`,
      'src/main/kotlin/demo/Invoice.kt': renamedCopy(INVOICE_NAMES, [0, 100, 1000, 10]),
    });
    writeFiles(root, {
      'src/main/kotlin/demo/Parcel.kt': renamedCopy(PARCEL_NAMES, [1, 10, 5000, 50]),
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

function renamedCopy(names, [low, scale, limit, discount]) {
  return `package demo

class ${names.type} {
    fun ${names.fn}(${names.list}: List<Entry>, factor: Int): Int {
        var ${names.sum} = ${low}
        for (${names.item} in ${names.list}) {
            if (${names.item}.price > ${low} && ${names.item}.count > ${low}) {
                ${names.sum} += ${names.item}.price * ${names.item}.count * factor
            } else if (${names.item}.price < ${low}) {
                ${names.sum} -= Math.abs(${names.item}.price) * ${names.item}.count
            }
            if (${names.sum} > ${limit}) {
                ${names.sum} = ${names.sum} - ${discount}
            }
        }
        val rounded = Math.round(${names.sum} * ${scale}.0) / ${scale}
        return if (rounded > ${limit}) rounded - ${discount} else rounded.toInt()
    }
}
`;
}

function importList(names) {
  const imports = names.flatMap((name) => [`import demo.${name}.One`, `import demo.${name}.Two`]);
  return `package demo\n\n${imports.join('\n')}\n`;
}

function dataClass(name, first, second) {
  const fields = Array.from({ length: 12 }, (_, index) => `    val ${first}${index}: String = "",`);
  return `package demo\n\ndata class ${name}(\n${fields.join('\n')}\n    val ${second}: Int = 0,\n)\n`;
}

function lookupTable(prefix) {
  const rows = Array.from({ length: 30 }, (_, index) => `    "${prefix}${index}" to ${index * 7},`);
  return `package demo\n\nval ${prefix}Table = mapOf(\n${rows.join('\n')}\n)\n`;
}
