import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runAnalyzers } from '../../../../core/diff/execution/run-analyzers.mjs';
import { withDefaultAnalyzerParallelism } from '../../../../core/diff/execution/test-support/analyzer-parallelism.mjs';
import { applyLayout, configuredAnalyzers } from '../diff/configured-analyzers.mjs';
import { resolveHeadPolicy, withHeadPolicyFile } from '../head-policy.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const temporaryRoots = [];

function pricing(names, numbers) {
  return `export function ${names.fn}(${names.list}: Line[], ${names.rate}: number): number {
  let ${names.sum} = 0;
  for (const ${names.item} of ${names.list}) {
    if (${names.item}.price > ${numbers[0]} && ${names.item}.quantity > ${numbers[1]}) {
      ${names.sum} += ${names.item}.price * ${names.item}.quantity * ${names.rate};
    } else if (${names.item}.price < ${numbers[0]}) {
      ${names.sum} -= Math.abs(${names.item}.price) * ${names.item}.quantity;
    }
  }
  const ${names.out} = Math.round(${names.sum} * ${numbers[2]}) / ${numbers[2]};
  return ${names.out} > ${numbers[3]} ? ${names.out} - ${numbers[4]} : ${names.out};
}
`;
}

function grading(names, numbers) {
  return `export function ${names.fn}(${names.list}: Mark[]): string[] {
  const ${names.out}: string[] = [];
  for (const ${names.item} of ${names.list}) {
    if (${names.item}.score >= ${numbers[0]}) {
      ${names.out}.push(\`\${${names.item}.name}: top\`);
    } else if (${names.item}.score >= ${numbers[1]}) {
      ${names.out}.push(\`\${${names.item}.name}: pass\`);
    } else {
      ${names.out}.push(\`\${${names.item}.name}: retry after \${${numbers[2]} - ${names.item}.score}\`);
    }
    if (${names.item}.late && ${names.out}.length > ${numbers[3]}) {
      ${names.out}.pop();
    }
  }
  return ${names.out}.sort((${names.left}, ${names.right}) => ${names.left}.localeCompare(${names.right}));
}
`;
}

const ORIGINAL = {
  fn: 'invoiceTotal',
  list: 'lines',
  rate: 'taxRate',
  sum: 'subtotal',
  item: 'line',
  out: 'rounded',
  left: 'a',
  right: 'b',
};
const RENAMED = {
  fn: 'weighBoxes',
  list: 'boxes',
  rate: 'factor',
  sum: 'accumulated',
  item: 'box',
  out: 'trimmed',
  left: 'x',
  right: 'y',
};

function tableTest(prefix) {
  const rows = Array.from(
    { length: 40 },
    (_, index) =>
      `  { input: '${prefix}${String(index)}', expected: ${String(index * 3)}, ok: true },`,
  ).join('\n');
  return `const CASES = [\n${rows}\n];\n\nexport const ${prefix}Cases = CASES;\n`;
}

function importList(names) {
  const lines = names.map(
    (name) => `import { ${name}One, ${name}Two, ${name}Three } from './${name}.js';`,
  );
  return `${lines.join('\n')}\n\nexport const ${names[0]}Used = ${names[0]}One;\n`;
}

function counter(names) {
  return `export function ${names.component}({ ${names.list} }: Props) {
  const [${names.selected}, set${names.selected}] = useState<string[]>([]);
  const toggle = (${names.item}: string) => {
    if (${names.selected}.includes(${names.item})) {
      set${names.selected}(${names.selected}.filter((entry) => entry !== ${names.item}));
    } else if (${names.selected}.length < ${names.limit}) {
      set${names.selected}([...${names.selected}, ${names.item}]);
    } else {
      set${names.selected}([${names.item}]);
    }
  };
  return (
    <ul>
      {${names.list}.map((${names.item}) => (
        <li key={${names.item}} onClick={() => toggle(${names.item})}>
          {${names.selected}.includes(${names.item}) ? '${names.mark}' : ${names.item}}
        </li>
      ))}
    </ul>
  );
}
`;
}

function form(tags) {
  const fields = tags
    .map(
      (tag, index) =>
        `      <${tag} className="field-${String(index)}" data-key="k${String(index)}">\n        <span>${tag}</span>\n      </${tag}>`,
    )
    .join('\n');
  return `export function Panel() {\n  return (\n    <div>\n${fields}\n    </div>\n  );\n}\n`;
}

const SHAPE_NAMES = (
  'id name email phone street city zip country role plan bio score level owner locale avatar ' +
  'status created updated timezone'
).split(' ');
const OTHER_NAMES = (
  'code total tax note carrier weight items paid buyer method coupon refund channel house ' +
  'invoice placed shipped tracking discount currency'
).split(' ');

function mapper(type, source, names) {
  const fields = names.map((name) => `    ${source}.${name},`).join('\n');
  return `export function to${type}Dto(${source}: ${type}) {\n  return new ${type}Dto(\n${fields}\n  );\n}\n`;
}

function switchTable(type, names) {
  const cases = names.map((name) => `    case ${type}.${name}:\n      return '${name}';`);
  return `export function ${type.toLowerCase()}Name(value: ${type}): string {\n  switch (value) {\n${cases.join('\n')}\n  }\n}\n`;
}

const FILES = {
  'src/mappers/first.ts': mapper('User', 'user', SHAPE_NAMES),
  'src/mappers/second.ts': mapper('Order', 'order', OTHER_NAMES),
  'src/tables/first.ts': switchTable('Color', SHAPE_NAMES),
  'src/tables/second.ts': switchTable('Status', OTHER_NAMES),
  'src/renamed/first.ts': pricing(ORIGINAL, ['0', '0', '100', '1000', '10']),
  'src/renamed/second.ts': pricing(RENAMED, ['1', '2', '10', '5000', '50']),
  'src/short/first.ts':
    'export function area(width: number, height: number): number {\n  return width * height;\n}\n',
  'src/short/second.ts':
    'export function size(side: number, depth: number): number {\n  return side * depth;\n}\n',
  'src/imports/first.ts': importList([
    'alpha',
    'beta',
    'gamma',
    'delta',
    'epsilon',
    'zeta',
    'eta',
    'theta',
    'iota',
    'kappa',
  ]),
  'src/imports/second.ts': importList([
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
  ]),
  'src/generated/first.ts': `// @generated\n${pricing(ORIGINAL, ['0', '0', '100', '1000', '10'])}`,
  'src/generated/second.ts': `// @generated\n${pricing(RENAMED, ['1', '2', '10', '5000', '50'])}`,
  'src/logic/first.tsx': counter({
    component: 'Picker',
    list: 'options',
    selected: 'chosen',
    item: 'option',
    limit: 3,
    mark: 'x',
  }),
  'src/logic/second.tsx': counter({
    component: 'Chooser',
    list: 'entries',
    selected: 'picked',
    item: 'entry',
    limit: 5,
    mark: 'y',
  }),
  'src/markup/first.tsx': form([
    'section',
    'article',
    'aside',
    'header',
    'footer',
    'nav',
    'main',
    'figure',
  ]),
  'src/markup/second.tsx': form([
    'label',
    'fieldset',
    'legend',
    'details',
    'summary',
    'dialog',
    'menu',
    'table',
  ]),
  'test/tables/first.test.ts': tableTest('alpha'),
  'test/tables/second.test.ts': tableTest('beta'),
  'test/helpers/first.test.ts': `import { it } from 'vitest';\n\n${grading(ORIGINAL, ['90', '50', '60', '3'])}\nit('works', () => {});\n`,
  'test/helpers/second.test.ts': `import { it } from 'vitest';\n\n${grading(RENAMED, ['80', '40', '70', '9'])}\nit('works', () => {});\n`,
};

function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

function enforceable(run) {
  return (run.reports.get('duplicates')?.findings ?? []).filter(
    (finding) => finding.classification === 'enforceable',
  );
}

function analyze(files, config = {}) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
  temporaryRoots.push(temporaryRoot);
  const projectRoot = path.join(temporaryRoot, 'base');
  writeFiles(projectRoot, files);
  const policy = resolveHeadPolicy(config);
  const analyzers = applyLayout(configuredAnalyzers(), policy).filter(
    ({ name }) => name === 'duplicates',
  );
  return withDefaultAnalyzerParallelism(() =>
    withHeadPolicyFile(policy, (headPolicyFile) =>
      runAnalyzers({
        analyzers,
        projectRoot,
        policyRoot: projectRoot,
        toolRoot: packageRoot,
        liveProjectRoot: packageRoot,
        snapshot: 'head',
        headPolicyFile,
      }),
    ),
  );
}

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

let cachedFindings;

function foundClones() {
  if (cachedFindings === undefined) {
    const run = analyze(FILES);

    cachedFindings = { findings: enforceable(run), toolErrors: run.toolErrors };
  }
  return cachedFindings;
}

function expectedClone({ file, other, hash, line, lines, advice = 'Keep one copy' }) {
  return {
    tool: 'duplicates',
    rule: 'duplicate-clone',
    path: file,
    identity: `renamed:pair:${file}|${other}:fragment:${hash}:occurrence:1`,
    message:
      `This code repeats ${other}:${String(line)} (${String(lines)} lines). ${advice} and call it from both ` +
      `places. If the repetition is intended, add ${file} or ${other} to "exclude" in nitpicker.config.json.`,
    classification: 'enforceable',
    location: { line },
  };
}

describe('clones whose names and literals were renamed', () => {
  it('runs without a tool error', () => {
    expect(foundClones().toolErrors).toEqual([]);
  });

  it('reports the copy-pasted function with every local renamed', () => {
    const clone = foundClones().findings.find(({ path: file }) => file === 'src/renamed/first.ts');

    expect(clone).toEqual(
      expectedClone({
        file: 'src/renamed/first.ts',
        other: 'src/renamed/second.ts',
        hash: '2f4bb56275d13c34bd0f291f',
        line: 1,
        lines: 12,
      }),
    );
  });

  it('reports a component that repeats its logic although the markup differs', () => {
    const clone = foundClones().findings.find(({ path: file }) => file === 'src/logic/first.tsx');

    expect(clone).toEqual(
      expectedClone({
        file: 'src/logic/first.tsx',
        other: 'src/logic/second.tsx',
        hash: '20e1e008857a525fbf83d0de',
        line: 1,
        lines: 21,
      }),
    );
  });

  it('points a clone between two test files at a helper or a table', () => {
    const clone = foundClones().findings.find(
      ({ path: file }) => file === 'test/helpers/first.test.ts',
    );

    expect(clone).toEqual(
      expectedClone({
        file: 'test/helpers/first.test.ts',
        other: 'test/helpers/second.test.ts',
        hash: 'cb054678e83a967c5cd306ce',
        line: 3,
        lines: 18,
        advice: 'Extract a helper, or fold the cases into one table-driven test. Keep one copy',
      }),
    );
  });

  it('stays quiet for short functions, imports, generated files, tables, mappers and markup', () => {
    expect(foundClones().findings.map(({ path: file }) => file)).toEqual([
      'src/logic/first.tsx',
      'src/renamed/first.ts',
      'test/helpers/first.test.ts',
    ]);
  });
});

describe('the exclude route for a clone', () => {
  it('lifts a clone when its files are excluded', () => {
    const run = analyze(FILES, { exclude: ['src/renamed/**', 'src/logic/**', 'test/**'] });

    expect(run.toolErrors).toEqual([]);
    expect(enforceable(run)).toEqual([]);
  });
});
