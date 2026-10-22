import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyFindingPolicy } from '../../../../shared/findings/finding-policy.mjs';
import { readDuplicateFindings, runJavaDuplicates } from '../metrics/java-duplicates.mjs';
import { readKotlinDuplicateFindings, runKotlinDuplicates } from '../kotlin/kotlin-duplicates.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const ONE_TWO_CLONE = {
  tool: 'duplicates',
  rule: 'duplicate-clone',
  path: 'src/main/java/demo/One.java',
  identity:
    'pair:src/main/java/demo/One.java|src/main/java/demo/Two.java:fragment:1b3aec1f1526b01ef1c1a869:occurrence:1',
  message:
    'This code repeats src/main/java/demo/Two.java:5 (13 lines). Keep one copy and call it from both places. If the repetition is intended, add src/main/java/demo/One.java or src/main/java/demo/Two.java to "exclude" in nitpicker.config.json.',
  classification: 'enforceable',
  location: { line: 5 },
};

const BODY = [
  'public int run(int a, int b) {',
  '    int total = 0;',
  '    for (int i = 0; i < a; i++) {',
  '        if (i % 2 == 0 && b > 0) {',
  '            total += i * b;',
  '        } else {',
  '            total -= b;',
  '        }',
  '    }',
  '    return total;',
  '}',
].join('\n');

const KOTLIN_BODY = [
  'fun run(a: Int, b: Int): Int {',
  '    var total = 0',
  '    for (i in 0 until a) {',
  '        if (i % 2 == 0 && b > 0) {',
  '            total += i * b',
  '        } else {',
  '            total -= b',
  '        }',
  '    }',
  '    return total',
  '}',
].join('\n');

function imports(prefix, semicolon) {
  return ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta']
    .map((name) => `import ${prefix}.${name}${semicolon}`)
    .join('\n');
}

function javaFile(name, header, body) {
  return `package demo;\n\n${header}\n\nclass ${name} {\n${body}\n}\n`;
}

function project(files, manifest = { sourceRoots: ['src/main/java'] }) {
  const projectRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-duplicates-')));
  roots.push(projectRoot);
  mkdirSync(path.join(projectRoot, 'build/nitpicker'), { recursive: true });
  writeFileSync(path.join(projectRoot, 'build/nitpicker/manifest.json'), JSON.stringify(manifest));
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(projectRoot, relative)), { recursive: true });
    writeFileSync(path.join(projectRoot, relative), contents);
  }
  return projectRoot;
}

function duplicateOptions(projectRoot, options) {
  const reportRoot = path.join(projectRoot, 'build/nitpicker');
  const manifest = JSON.parse(readFileSync(path.join(reportRoot, 'manifest.json'), 'utf8'));
  return { reportRoot, manifest, ...options };
}

function clones(projectRoot, options) {
  runJavaDuplicates(projectRoot, duplicateOptions(projectRoot, options));
  return readDuplicateFindings(path.join(projectRoot, 'build/nitpicker')).filter(
    ({ rule }) => rule === 'duplicate-clone',
  );
}

describe('duplicates in Java sources', () => {
  it('does not report clones made only of package and import lines', () => {
    const header = imports('com.example.shared', ';');
    const projectRoot = project({
      'src/main/java/demo/One.java': javaFile('One', header, 'int one() { return 1; }'),
      'src/main/java/demo/Two.java': javaFile('Two', header, 'int two() { return 2; }'),
    });

    expect(clones(projectRoot)).toEqual([]);
  });

  it('still reports a clone that carries code after the imports', () => {
    const header = imports('com.example.shared', ';');
    const projectRoot = project({
      'src/main/java/demo/One.java': javaFile('One', header, BODY),
      'src/main/java/demo/Two.java': javaFile('Two', header, BODY),
    });

    expect(clones(projectRoot).map(({ path: file }) => file)).toEqual([
      'src/main/java/demo/One.java',
    ]);
  });

  it('names both files in the message, which tells to exclude either', () => {
    const projectRoot = project({
      'src/main/java/demo/One.java': javaFile('One', '', BODY),
      'src/main/java/demo/Two.java': javaFile('Two', '', BODY),
    });

    expect(clones(projectRoot)).toEqual([ONE_TWO_CLONE]);
  });

  it('drops the clone when an exclude matches only the second file of the pair', () => {
    const projectRoot = project({
      'src/main/java/demo/One.java': javaFile('One', '', BODY),
      'src/main/java/demo/Two.java': javaFile('Two', '', BODY),
    });
    runJavaDuplicates(projectRoot, duplicateOptions(projectRoot));
    const found = readDuplicateFindings(path.join(projectRoot, 'build/nitpicker')).filter(
      ({ rule }) => rule === 'duplicate-clone',
    );

    expect(found).toEqual([ONE_TWO_CLONE]);
    expect(applyFindingPolicy(found, { exclude: ['src/main/java/demo/Two.java'] })).toEqual([]);
    expect(applyFindingPolicy(found, { exclude: ['src/main/java/demo/One.java'] })).toEqual([]);
    expect(applyFindingPolicy(found, { exclude: ['src/main/java/demo/Three.java'] })).toEqual(
      found,
    );
  });

  it('skips build and generated folders by default and analyses what the project keeps', () => {
    const projectRoot = project({
      'src/main/java/demo/build/One.java': javaFile('One', '', BODY),
      'src/main/java/demo/build/Two.java': javaFile('Two', '', BODY),
      'src/main/java/demo/generated/Three.java': javaFile('Three', '', BODY),
      'src/main/java/demo/generated/Four.java': javaFile('Four', '', BODY),
    });

    expect(clones(projectRoot)).toEqual([]);
    expect(
      clones(projectRoot, { skippedFolders: ['generated'] }).map(({ path: file }) => file),
    ).toEqual(['src/main/java/demo/build/One.java']);
  });
});

describe('an empty folder list for the Java duplicate scan', () => {
  it('scans every folder, build and generated included', () => {
    const projectRoot = project({
      'src/main/java/demo/build/One.java': javaFile('One', '', BODY),
      'src/main/java/demo/build/Two.java': javaFile('Two', '', BODY),
    });

    expect(clones(projectRoot)).toEqual([]);
    expect(clones(projectRoot, { skippedFolders: [] }).map(({ path: file }) => file)).toEqual([
      'src/main/java/demo/build/One.java',
    ]);
  });
});

describe('duplicates in Kotlin sources', () => {
  const kotlinProject = (files) =>
    project(files, { sourceRoots: [], kotlinSourceRoots: ['src/main/kotlin'] });

  function kotlinClones(projectRoot, skippedFolders) {
    runKotlinDuplicates(projectRoot, duplicateOptions(projectRoot, { skippedFolders }));
    return readKotlinDuplicateFindings(path.join(projectRoot, 'build/nitpicker')).filter(
      ({ rule }) => rule === 'duplicate-clone',
    );
  }

  it('does not report clones made only of package and import lines', () => {
    const header = imports('com.example.shared', '');
    const projectRoot = kotlinProject({
      'src/main/kotlin/demo/One.kt': `package demo\n\n${header}\n\nfun one() = 1\n`,
      'src/main/kotlin/demo/Two.kt': `package demo\n\n${header}\n\nfun two() = 2\n`,
    });

    expect(kotlinClones(projectRoot)).toEqual([]);
  });

  it('reports a clone of code and honours the project folder list', () => {
    const projectRoot = kotlinProject({
      'src/main/kotlin/demo/build/One.kt': `package demo\n\n${KOTLIN_BODY}\n`,
      'src/main/kotlin/demo/build/Two.kt': `package demo\n\n${KOTLIN_BODY}\n`,
    });

    expect(kotlinClones(projectRoot)).toEqual([]);
    expect(kotlinClones(projectRoot, ['target']).map(({ path: file }) => file)).toEqual([
      'src/main/kotlin/demo/build/One.kt',
    ]);
  });
});

const FIELDS = (
  'id name email phone street city zip country role plan bio score level owner locale avatar ' +
  'status created updated timezone'
).split(' ');
const ORDER_FIELDS = (
  'code total tax note carrier weight items paid buyer method coupon refund channel house ' +
  'invoice placed shipped tracking discount currency'
).split(' ');

function renamedClones(projectRoot, { run, read }) {
  run(projectRoot, duplicateOptions(projectRoot));
  return read(path.join(projectRoot, 'build/nitpicker'), projectRoot)
    .filter(({ rule }) => rule === 'duplicate-clone')
    .map(({ path: file, identity }) => `${file} ${identity.split(':')[0]}`);
}

const JAVA_RENAMED = {
  run: runJavaDuplicates,
  read: (reportRoot, projectRoot) => readDuplicateFindings(reportRoot, { projectRoot }),
};

function javaCopy({ type, fn, list, sum, item }, [low, limit, scale, discount]) {
  return `package demo;

import java.util.List;

class ${type} {
    int ${fn}(List<Entry> ${list}, int factor) {
        int ${sum} = ${low};
        for (Entry ${item} : ${list}) {
            if (${item}.price > ${low} && ${item}.count > ${low}) {
                ${sum} += ${item}.price * ${item}.count * factor;
            } else if (${item}.price < ${low}) {
                ${sum} -= Math.abs(${item}.price) * ${item}.count;
            }
            if (${sum} > ${limit}) {
                ${sum} = ${sum} - ${discount};
            }
        }
        long rounded = Math.round(${sum} * ${scale}.0) / ${scale};
        return rounded > ${limit} ? (int) (rounded - ${discount}) : (int) rounded;
    }
}
`;
}

function javaMapper(type, source, fields) {
  const getters = fields.map((field) => `                ${source}.get${field}()`).join(',\n');
  return `package demo;\n\nfinal class ${type}Mapper {\n    static ${type}Dto to${type}Dto(${type} ${source}) {\n        return new ${type}Dto(\n${getters});\n    }\n}\n`;
}

function javaSwitch(type, values) {
  const cases = values.map((value) => `            case ${value.toUpperCase()} -> "${value}";`);
  return `package demo;\n\nfinal class ${type}Names {\n    static String name(${type} value) {\n        return switch (value) {\n${cases.join('\n')}\n        };\n    }\n}\n`;
}

function javaBean(type, fields) {
  const members = fields.flatMap((field) => [
    `    private String ${field};`,
    `    public String get${field}() {`,
    `        return ${field};`,
    '    }',
    `    public void set${field}(String ${field}) {`,
    `        this.${field} = ${field};`,
    '    }',
  ]);
  return `package demo;\n\npublic class ${type} {\n${members.join('\n')}\n}\n`;
}

describe('Java copies whose names and literals were renamed', () => {
  it('reports a copied method with every name and literal changed', () => {
    const projectRoot = project({
      'src/main/java/demo/Invoice.java': javaCopy(
        { type: 'Invoice', fn: 'total', list: 'lines', sum: 'subtotal', item: 'line' },
        [0, 1000, 100, 10],
      ),
      'src/main/java/demo/Parcel.java': javaCopy(
        { type: 'Parcel', fn: 'weigh', list: 'boxes', sum: 'running', item: 'box' },
        [1, 5000, 10, 50],
      ),
    });

    expect(renamedClones(projectRoot, JAVA_RENAMED)).toEqual([
      'src/main/java/demo/Invoice.java renamed',
    ]);
  });

  it('stays quiet for mappers, enum switches and beans that only share a shape', () => {
    const projectRoot = project({
      'src/main/java/demo/UserMapper.java': javaMapper('User', 'user', FIELDS),
      'src/main/java/demo/OrderMapper.java': javaMapper('Order', 'order', ORDER_FIELDS),
      'src/main/java/demo/ColorNames.java': javaSwitch('Color', FIELDS),
      'src/main/java/demo/StatusNames.java': javaSwitch('Status', ORDER_FIELDS),
      'src/main/java/demo/UserBean.java': javaBean('UserBean', FIELDS.slice(0, 5)),
      'src/main/java/demo/OrderBean.java': javaBean('OrderBean', ORDER_FIELDS.slice(0, 5)),
    });

    expect(renamedClones(projectRoot, JAVA_RENAMED)).toEqual([]);
  });
});

const KOTLIN_RENAMED = {
  run: runKotlinDuplicates,
  read: (reportRoot, projectRoot) => readKotlinDuplicateFindings(reportRoot, projectRoot),
};

function kotlinCopy({ type, fn, list, sum, item }, [low, limit, scale, discount]) {
  return `package demo

class ${type} {
    fun ${fn}(${list}: List<Entry>, factor: Int): Int {
        var ${sum} = ${low}
        for (${item} in ${list}) {
            if (${item}.price > ${low} && ${item}.count > ${low}) {
                ${sum} += ${item}.price * ${item}.count * factor
            } else if (${item}.price < ${low}) {
                ${sum} -= Math.abs(${item}.price) * ${item}.count
            }
            if (${sum} > ${limit}) {
                ${sum} = ${sum} - ${discount}
            }
        }
        val rounded = Math.round(${sum} * ${scale}.0) / ${scale}
        return if (rounded > ${limit}) rounded - ${discount} else rounded.toInt()
    }
}
`;
}

function kotlinMapper(type, fields) {
  const assignments = fields.map((field) => `        ${field} = this.${field},`).join('\n');
  return `package demo\n\nfun ${type}.to${type}Dto(): ${type}Dto =\n    ${type}Dto(\n${assignments}\n    )\n`;
}

function kotlinWhen(type, values) {
  const branches = values.map((value) => `        ${type}.${value.toUpperCase()} -> "${value}"`);
  return `package demo\n\nfun ${type.toLowerCase()}Name(value: ${type}): String =\n    when (value) {\n${branches.join('\n')}\n    }\n`;
}

function kotlinDataClass(type, fields) {
  const defaults = ['""', 'emptyList()', '0', 'mutableMapOf()', 'null', 'listOf("a")', 'now()'];
  const types = [
    'String',
    'List<String>',
    'Int',
    'MutableMap<String, Int>',
    'String?',
    'Any',
    'Instant',
  ];
  const parameters = fields.map((field, index) => {
    const kind = Math.floor(index / 3) % types.length;
    return `    val ${field}: ${types[kind]} = ${defaults[kind]},`;
  });
  return `package demo\n\ndata class ${type}(\n${parameters.join('\n')}\n)\n`;
}

function kotlinChain(name, step) {
  const branches = Array.from(
    { length: 9 },
    (_, index) => `    if (value > ${index * step}) {\n        result += 1\n    }`,
  );
  return `package demo\n\nfun ${name}(value: Int): Int {\n    var result = 0\n${branches.join('\n')}\n    return result\n}\n`;
}

describe('Kotlin copies whose names and literals were renamed', () => {
  const kotlinProject = (files) =>
    project(files, { sourceRoots: [], kotlinSourceRoots: ['src/main/kotlin'] });

  it('reports a copied function with every name and literal changed', () => {
    const projectRoot = kotlinProject({
      'src/main/kotlin/demo/Invoice.kt': kotlinCopy(
        { type: 'Invoice', fn: 'total', list: 'lines', sum: 'subtotal', item: 'line' },
        [0, 1000, 100, 10],
      ),
      'src/main/kotlin/demo/Parcel.kt': kotlinCopy(
        { type: 'Parcel', fn: 'weigh', list: 'boxes', sum: 'running', item: 'box' },
        [1, 5000, 10, 50],
      ),
    });

    expect(renamedClones(projectRoot, KOTLIN_RENAMED)).toEqual([
      'src/main/kotlin/demo/Invoice.kt renamed',
    ]);
  });

  it('stays quiet for mappers, when tables, data classes and if chains that only share a shape', () => {
    const projectRoot = kotlinProject({
      'src/main/kotlin/demo/UserMapper.kt': kotlinMapper('User', FIELDS),
      'src/main/kotlin/demo/OrderMapper.kt': kotlinMapper('Order', ORDER_FIELDS),
      'src/main/kotlin/demo/ColorNames.kt': kotlinWhen('Color', FIELDS),
      'src/main/kotlin/demo/StatusNames.kt': kotlinWhen('Status', ORDER_FIELDS),
      'src/main/kotlin/demo/UserView.kt': kotlinDataClass('UserView', FIELDS),
      'src/main/kotlin/demo/OrderView.kt': kotlinDataClass('OrderView', ORDER_FIELDS),
      'src/main/kotlin/demo/Classify.kt': kotlinChain('classify', 10),
      'src/main/kotlin/demo/Rank.kt': kotlinChain('rank', 13),
    });

    expect(renamedClones(projectRoot, KOTLIN_RENAMED)).toEqual([]);
  });
});
