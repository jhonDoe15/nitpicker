import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fieldsOf, parseJson, textOf } from '../../../../../shared/values/readers.mts';

const FIRST_REPORTED_LINE = 3;
const JACOCO_FILE = 'jacoco.xml';
const ERRORPRONE_FILE = 'errorprone.json';
const STRUCTURE_FILE = 'structure.json';
const KOTLIN_FACTS = 'kotlin-mutation-facts.json';
const KOTLIN_METRICS = 'kotlin-metrics.json';

type Run = {
  readonly cwd: string;
  readonly reportBase: string | undefined;
  readonly kotlin: boolean;
  readonly formatter: string | undefined;
  readonly testsFailed: string[];
};
type GradleModule = { readonly run: Run; readonly dir: string; readonly dirPath: string };
type ModuleEntry = { readonly key: string; readonly path: string; readonly dir: string };
type FakeResult = { status: number; stdout: string; stderr: string };

function at(run: Run, file: string | undefined) {
  if (file === undefined) {
    throw new TypeError('The "paths[1]" argument must be of type string. Received undefined');
  }
  return path.resolve(run.cwd, file);
}

function exists(run: Run, file: string) {
  return existsSync(at(run, file));
}

function bytes(run: Run, file: string) {
  return readFileSync(at(run, file));
}

function lines(run: Run, file: string): string[] {
  return exists(run, file) ? bytes(run, file).toString('utf8').split('\n').filter(Boolean) : [];
}

function put(run: Run, file: string, contents: string | Buffer) {
  writeFileSync(at(run, file), contents);
}

function sarif(name: string, results: unknown[]) {
  return JSON.stringify({ runs: [{ tool: { driver: { name } }, results }] });
}

function resultAt(uri: string, index: number, fields: Record<string, unknown>) {
  return {
    ...fields,
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri },
          region: { startLine: index + FIRST_REPORTED_LINE },
        },
      },
    ],
  };
}

function detektResult(kotlinFile: string, line: string, index: number) {
  const named = line.includes(' :: ');
  return resultAt(kotlinFile, index, {
    ruleId: named ? line.split(' :: ')[0] : 'detekt.style.MagicNumber',
    level: 'warning',
    message: { text: named ? line.split(' :: ')[1] : line },
  });
}

function ktlintResult(kotlinFile: string, line: string, index: number) {
  return resultAt(kotlinFile, index, {
    ruleId: line.split('|')[0],
    level: 'error',
    message: { text: line.split('|')[1] },
  });
}

function moduleFile(module: GradleModule, name: string) {
  const file = `${module.dirPath}/${name}`;
  mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

function moduleName(module: GradleModule) {
  return module.dir === '' ? '.' : module.dir;
}

function testsFailedIn(module: GradleModule) {
  return module.run.testsFailed.includes(moduleName(module));
}

function inside(module: GradleModule, file: string) {
  return module.dir === '' ? file : `${module.dir}/${file}`;
}

function writeKotlinReports(module: GradleModule) {
  const { run } = module;
  const kotlinFile = inside(module, 'src/main/kotlin/demo/K.kt');
  const detekt = lines(run, 'detekt.txt').map((line, index) =>
    detektResult(kotlinFile, line, index),
  );
  const ktlint = lines(run, 'ktlint.txt').map((line, index) =>
    ktlintResult(kotlinFile, line, index),
  );
  writeFileSync(moduleFile(module, 'detekt.sarif'), sarif('detekt', detekt));
  writeFileSync(moduleFile(module, 'ktlint.sarif'), sarif('ktlint', ktlint));
  writeFileSync(moduleFile(module, 'ktfmt.txt'), lines(run, 'kotlin-format.txt').join('\n'));
  const metrics = [inside(module, KOTLIN_METRICS), KOTLIN_METRICS].find((file) =>
    exists(run, file),
  );
  if (metrics !== undefined) {
    writeFileSync(moduleFile(module, KOTLIN_METRICS), bytes(run, metrics));
  }
  const facts = [inside(module, KOTLIN_FACTS), KOTLIN_FACTS].find((file) => exists(run, file));
  if (facts !== undefined) {
    writeFileSync(moduleFile(module, KOTLIN_FACTS), bytes(run, facts));
  }
}

function writeJavaReports(module: GradleModule) {
  const { run } = module;
  const violations = lines(run, 'violations.txt').map((text, index) =>
    resultAt(inside(module, 'src/main/java/demo/A.java'), index, {
      ruleId: 'UnusedPrivateField',
      message: { text },
    }),
  );
  writeFileSync(moduleFile(module, 'pmd.sarif'), sarif('PMD', violations));
  writeFileSync(moduleFile(module, 'spotbugs.sarif'), sarif('SpotBugs', []));
  writeFileSync(moduleFile(module, 'format.txt'), '');
  writeFileSync(
    moduleFile(module, 'checkstyle.xml'),
    exists(run, 'checkstyle-report.xml')
      ? bytes(run, 'checkstyle-report.xml')
      : '<checkstyle version="10.21.1"></checkstyle>',
  );
  writeFileSync(
    moduleFile(module, STRUCTURE_FILE),
    exists(run, inside(module, STRUCTURE_FILE)) ? bytes(run, inside(module, STRUCTURE_FILE)) : '[]',
  );
  writeFileSync(moduleFile(module, 'classes.json'), '{"files":{},"classes":[]}');
  writeFileSync(
    moduleFile(module, ERRORPRONE_FILE),
    exists(run, inside(module, ERRORPRONE_FILE))
      ? bytes(run, inside(module, ERRORPRONE_FILE))
      : '[]\n',
  );
}

function copyJdeps(module: GradleModule) {
  const { run } = module;
  for (const name of ['jdeps.txt', 'jdeps-classes.txt', 'jdeps-test.txt', 'permits.txt']) {
    const source = [inside(module, name), inside(module, `jdeps/${name}`)].find((file) =>
      exists(run, file),
    );
    if (source !== undefined) {
      writeFileSync(moduleFile(module, name), bytes(run, source));
    }
  }
}

function writeExtras(module: GradleModule) {
  const { run } = module;
  if (!(lines(run, 'NO_JACOCO_IN').includes(moduleName(module)) || testsFailedIn(module))) {
    writeFileSync(
      moduleFile(module, JACOCO_FILE),
      exists(run, JACOCO_FILE) ? bytes(run, JACOCO_FILE) : '<report name="demo"></report>',
    );
  }
  if (exists(run, 'MAIN_CLASSES')) {
    writeFileSync(moduleFile(module, 'jdeps-classes.txt'), 'demo.A\n');
  }
  copyJdeps(module);
  if (exists(run, inside(module, 'test-results'))) {
    cpSync(at(run, inside(module, 'test-results')), `${module.dirPath}/test-results`, {
      recursive: true,
    });
  }
  if (exists(run, 'mutations.xml')) {
    writeFileSync(moduleFile(module, 'pit/mutations.xml'), bytes(run, 'mutations.xml'));
  }
}

function manifestOf(module: GradleModule) {
  const { run } = module;
  return {
    versions: {},
    sourceRoots: [inside(module, 'src/main/java')],
    testsFailed: testsFailedIn(module),
    ...(run.kotlin && {
      kotlin: true,
      kotlinSourceRoots: [inside(module, 'src/main/kotlin')],
      kotlinFormatter: run.formatter ?? 'none',
    }),
  };
}

function writeModule(run: Run, { key, dir }: ModuleEntry) {
  const module: GradleModule = { run, dir, dirPath: `${at(run, run.reportBase)}/${key}` };
  writeFileSync(moduleFile(module, 'manifest.json'), JSON.stringify(manifestOf(module)));
  if (lines(run, 'EMPTY_MODULES').includes(dir)) {
    return;
  }
  if (run.kotlin) {
    writeKotlinReports(module);
  }
  writeJavaReports(module);
  writeExtras(module);
}

function argumentValue(args: string[], name: string) {
  const found = args.find((argument) => argument.startsWith(`${name}=`));
  return found?.slice(name.length + 1);
}

function writeProperties(run: Run, args: string[]) {
  const exported = argumentValue(args, '-Pnitpicker.checkstyle.exportConfig');
  if (exported !== undefined) {
    put(run, exported, '<module name="Checker"/>');
  }
  const styleFile = argumentValue(args, '-Pnitpicker.kotlin.styleFile');
  if (styleFile !== undefined) {
    put(run, 'build/style-file.json', bytes(run, styleFile));
  }
}

function modulesOf(run: Run): ModuleEntry[] {
  if (exists(run, 'NO_REPORTS')) {
    return [];
  }
  const more = lines(run, 'modules.txt').map((dir) => ({
    key: `module-${dir}`,
    path: `:${dir}`,
    dir,
  }));
  return [{ key: 'root', path: ':', dir: '' }, ...more];
}

function failTests(run: Run, stdout: string): FakeResult | undefined {
  if (!exists(run, 'TESTS_FAIL') || run.testsFailed.length > 0) {
    return undefined;
  }
  const failing = Object.entries(fieldsOf(parseJson(readFileSync(at(run, 'TESTS_FAIL'), 'utf8'))));
  const listed = failing.map(([dir, suite]) => {
    const results = at(run, `build/test-results/${dir || 'root'}`);
    mkdirSync(results, { recursive: true });
    writeFileSync(path.join(results, 'TEST-demo.ATest.xml'), textOf(suite));
    return { dir, results: [results] };
  });
  put(run, `${String(run.reportBase)}/test-results.json`, JSON.stringify(listed));
  return { status: 1, stdout, stderr: 'FAILURE: Build failed with an exception.\n' };
}

export function runFakeGradle({ args, cwd }: { args: string[]; cwd: string }): FakeResult {
  const run: Run = {
    cwd,
    reportBase: argumentValue(args, '-Pnitpicker.reportDir'),
    kotlin: args.includes('-Pnitpicker.kotlin=true'),
    formatter: argumentValue(args, '-Pnitpicker.kotlin.formatter'),
    testsFailed: (argumentValue(args, '-Pnitpicker.testsFailed') ?? '').split(',').filter(Boolean),
  };
  const stdout = exists(run, 'GRADLE_STDOUT') ? readFileSync(at(run, 'GRADLE_STDOUT'), 'utf8') : '';
  if (exists(run, 'GRADLE_FAIL')) {
    return { status: 1, stdout, stderr: `${readFileSync(at(run, 'GRADLE_FAIL'), 'utf8')}\n` };
  }
  const modules = modulesOf(run);
  mkdirSync(at(run, run.reportBase), { recursive: true });
  mkdirSync(at(run, 'build'), { recursive: true });
  const failed = failTests(run, stdout);
  if (failed !== undefined) {
    return failed;
  }
  put(run, 'build/gradle-args.json', JSON.stringify(args));
  appendFileSync(at(run, 'build/gradle-calls.jsonl'), `${JSON.stringify(args)}\n`);
  writeProperties(run, args);
  put(run, `${String(run.reportBase)}/modules.json`, JSON.stringify(modules));
  for (const module of modules) {
    writeModule(run, module);
  }
  return { status: 0, stdout, stderr: '' };
}
