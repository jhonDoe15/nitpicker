import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyFindingPolicy } from '../../../../shared/findings/finding-policy.mjs';
import { readDuplicateFindings, runJavaDuplicates } from '../metrics/java-duplicates.mts';
import { callUntyped, findingsOf, type JavaFinding } from '../typed/java-values.mts';
import { readKotlinDuplicateFindings, runKotlinDuplicates } from '../kotlin/kotlin-duplicates.mts';
import { parseJson, textOf } from '../../../../shared/values/readers.mts';
import {
  FIELDS,
  ORDER_FIELDS,
  javaBean,
  javaCopy,
  javaMapper,
  javaSwitch,
  kotlinChain,
  kotlinCopy,
  kotlinDataClass,
  kotlinMapper,
  kotlinWhen,
} from './test-support/renamed-sources.mts';
import { mergedRoots } from '../../builds/java-modules.mts';

type Files = Readonly<Record<string, string>>;
type Runner = {
  readonly run: (projectRoot: string, options: DuplicateOptions) => void;
  readonly read: (reportRoot: string, projectRoot: string) => JavaFinding[];
};
type DuplicateOptions = {
  readonly reportRoot: string;
  readonly manifest: unknown;
  readonly skippedFolders: readonly string[] | undefined;
};

const roots: string[] = [];

function excluding(found: readonly JavaFinding[], exclude: readonly string[]): unknown {
  return callUntyped(applyFindingPolicy, found, { exclude });
}

function runJava(projectRoot: string, options: DuplicateOptions): void {
  callUntyped(runJavaDuplicates, projectRoot, options);
}

function readJava(reportRoot: string, projectRoot?: string): JavaFinding[] {
  return findingsOf(callUntyped(readDuplicateFindings, reportRoot, { projectRoot }));
}

function readKotlin(reportRoot: string, projectRoot?: string): JavaFinding[] {
  return findingsOf(callUntyped(readKotlinDuplicateFindings, reportRoot, projectRoot));
}

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
  ratchet: {
    key: 'pair:src/main/java/demo/One.java|src/main/java/demo/Two.java:clone',
    value: 70,
    divisible: true,
    mustKeepUnchangedLines: [
      { path: 'src/main/java/demo/One.java', startLine: 5, endLine: 17 },
      { path: 'src/main/java/demo/Two.java', startLine: 5, endLine: 17 },
    ],
  },
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

function imports(prefix: string, semicolon: string): string {
  return ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta']
    .map((name) => `import ${prefix}.${name}${semicolon}`)
    .join('\n');
}

function javaFile(name: string, header: string, body: string): string {
  return `package demo;\n\n${header}\n\nclass ${name} {\n${body}\n}\n`;
}

function project(
  files: Files,
  manifest: Readonly<Record<string, readonly string[]>> = { sourceRoots: ['src/main/java'] },
  under = '.',
): string {
  const outer = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-duplicates-')));
  roots.push(outer);
  const projectRoot = path.join(outer, under);
  mkdirSync(path.join(projectRoot, 'build/nitpicker'), { recursive: true });
  writeFileSync(path.join(projectRoot, 'build/nitpicker/manifest.json'), JSON.stringify(manifest));
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(projectRoot, relative)), { recursive: true });
    writeFileSync(path.join(projectRoot, relative), contents);
  }
  return projectRoot;
}

function duplicateOptions(
  projectRoot: string,
  options: { readonly skippedFolders?: readonly string[] | undefined } = {},
): DuplicateOptions {
  const reportRoot = path.join(projectRoot, 'build/nitpicker');
  const manifest: unknown = parseJson(readFileSync(path.join(reportRoot, 'manifest.json'), 'utf8'));
  return { reportRoot, manifest, skippedFolders: options.skippedFolders };
}

function clones(
  projectRoot: string,
  options?: { readonly skippedFolders?: readonly string[] | undefined },
): JavaFinding[] {
  runJava(projectRoot, duplicateOptions(projectRoot, options));
  return readJava(path.join(projectRoot, 'build/nitpicker')).filter(
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

  it.each(['build', 'target', 'out'])(
    'reports the clone when the checkout sits under a folder named %s',
    (folder) => {
      const files = {
        'src/main/java/demo/One.java': javaFile('One', '', BODY),
        'src/main/java/demo/Two.java': javaFile('Two', '', BODY),
      };

      expect(clones(project(files, undefined, folder))).toEqual([ONE_TWO_CLONE]);
    },
  );

  it('drops the clone when an exclude matches only the second file of the pair', () => {
    const projectRoot = project({
      'src/main/java/demo/One.java': javaFile('One', '', BODY),
      'src/main/java/demo/Two.java': javaFile('Two', '', BODY),
    });
    runJava(projectRoot, duplicateOptions(projectRoot));
    const found = readJava(path.join(projectRoot, 'build/nitpicker')).filter(
      ({ rule }) => rule === 'duplicate-clone',
    );

    expect(found).toEqual([ONE_TWO_CLONE]);
    expect(excluding(found, ['src/main/java/demo/Two.java'])).toEqual([]);
    expect(excluding(found, ['src/main/java/demo/One.java'])).toEqual([]);
    expect(excluding(found, ['src/main/java/demo/Three.java'])).toEqual(found);
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
  function kotlinProject(files: Files): string {
    return project(files, { sourceRoots: [], kotlinSourceRoots: ['src/main/kotlin'] });
  }

  function kotlinClones(projectRoot: string, skippedFolders?: readonly string[]): JavaFinding[] {
    runKotlinDuplicates(projectRoot, duplicateOptions(projectRoot, { skippedFolders }));
    return readKotlin(path.join(projectRoot, 'build/nitpicker')).filter(
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

  it('reports the clone when the checkout sits under a folder named build', () => {
    const projectRoot = project(
      {
        'src/main/kotlin/demo/One.kt': `package demo\n\n${KOTLIN_BODY}\n`,
        'src/main/kotlin/demo/Two.kt': `package demo\n\n${KOTLIN_BODY}\n`,
      },
      { sourceRoots: [], kotlinSourceRoots: ['src/main/kotlin'] },
      'build',
    );

    expect(kotlinClones(projectRoot).map(({ path: file }) => file)).toEqual([
      'src/main/kotlin/demo/One.kt',
    ]);
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

describe('duplicates across the modules of a Maven project', () => {
  function reactor() {
    const projectRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-reactor-clones-')));
    roots.push(projectRoot);
    const files: Record<string, string> = {
      'app/src/main/java/demo/One.java': javaFile('One', '', BODY),
      'app/src/main/java/demo/Two.java': javaFile('Two', '', BODY),
      'core/src/main/kotlin/demo/One.kt': `package demo\n\n${KOTLIN_BODY}\n`,
      'core/src/main/kotlin/demo/Two.kt': `package demo\n\n${KOTLIN_BODY}\n`,
    };
    for (const [name, manifest] of Object.entries({
      app: { sourceRoots: ['src/main/java'] },
      core: { sourceRoots: [], kotlinSourceRoots: ['src/main/kotlin'] },
    })) {
      files[`${name}/target/nitpicker/manifest.json`] = JSON.stringify(manifest);
    }
    for (const [relative, contents] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(projectRoot, relative)), { recursive: true });
      writeFileSync(path.join(projectRoot, relative), contents);
    }
    return projectRoot;
  }

  it('runs once from the project root over the roots of every module, Java and Kotlin alike', () => {
    const projectRoot = reactor();
    const reportRoot = path.join(projectRoot, 'target/nitpicker');
    const manifest = mergedRoots(
      projectRoot,
      [path.join(projectRoot, 'app'), path.join(projectRoot, 'core')],
      'target/nitpicker',
    );
    runJava(projectRoot, { reportRoot, manifest, skippedFolders: undefined });
    runKotlinDuplicates(projectRoot, { reportRoot, manifest, skippedFolders: undefined });

    expect(
      [...readJava(reportRoot), ...readKotlin(reportRoot)]
        .filter(({ rule }) => rule === 'duplicate-clone')
        .map(({ path: file }) => file),
    ).toEqual(['app/src/main/java/demo/One.java', 'core/src/main/kotlin/demo/One.kt']);
  });
});

function renamedClones(projectRoot: string, { run, read }: Runner): string[] {
  run(projectRoot, duplicateOptions(projectRoot));
  return read(path.join(projectRoot, 'build/nitpicker'), projectRoot)
    .filter(({ rule }) => rule === 'duplicate-clone')
    .map((finding) => `${finding.path} ${textOf(finding.identity).split(':')[0] ?? ''}`);
}

const JAVA_RENAMED: Runner = { run: runJava, read: readJava };

describe('Java copies whose names and literals were renamed', () => {
  it('reports a copied method with every name and literal changed', () => {
    const projectRoot = project({
      'src/main/java/demo/Invoice.java': javaCopy(
        { type: 'Invoice', fn: 'total', list: 'lines', sum: 'subtotal', item: 'line' },
        ['0', '1000', '100', '10'],
      ),
      'src/main/java/demo/Parcel.java': javaCopy(
        { type: 'Parcel', fn: 'weigh', list: 'boxes', sum: 'running', item: 'box' },
        ['1', '5000', '10', '50'],
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

const KOTLIN_RENAMED: Runner = { run: runKotlinDuplicates, read: readKotlin };

describe('Kotlin copies whose names and literals were renamed', () => {
  function kotlinProject(files: Files): string {
    return project(files, { sourceRoots: [], kotlinSourceRoots: ['src/main/kotlin'] });
  }

  it('reports a copied function with every name and literal changed', () => {
    const projectRoot = kotlinProject({
      'src/main/kotlin/demo/Invoice.kt': kotlinCopy(
        { type: 'Invoice', fn: 'total', list: 'lines', sum: 'subtotal', item: 'line' },
        ['0', '1000', '100', '10'],
      ),
      'src/main/kotlin/demo/Parcel.kt': kotlinCopy(
        { type: 'Parcel', fn: 'weigh', list: 'boxes', sum: 'running', item: 'box' },
        ['1', '5000', '10', '50'],
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
