import { describe, expect, it } from 'vitest';
import { commit, kotlinRepository, run, useGradleFixtures, write } from './java-cli-harness.mjs';

useGradleFixtures();

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
    write(root, {
      'src/main/kotlin/demo/Wide.kt': `package demo\n\nval answer = 1\n\nfun ${FOUR_PARAMETERS} = 0\n`,
      'kotlin-metrics.json': metricsOf(wideFunction('sum', 4, 5)),
    });
    commit(root, 'move the function');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
  });
  it('fails a Kotlin function that grows past the parameter limit it already exceeded', () => {
    const root = legacyWide();
    write(root, {
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
    write(root, {
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
    write(root, {
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
          'This code repeats src/main/kotlin/demo/Right.kt:3 (46 lines). Keep one copy and call it from both places.',
        classification: 'enforceable',
        location: { line: 3 },
      },
    ]);
  });
});
