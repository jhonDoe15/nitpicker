#!/usr/bin/env node
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

function filesIn(cwd) {
  const at = (file) => path.resolve(cwd, file);
  const exists = (file) => existsSync(at(file));
  const bytes = (file) => readFileSync(at(file));
  return {
    at,
    exists,
    bytes,
    read: (file) => readFileSync(at(file), 'utf8'),
    write: (file, contents) => writeFileSync(at(file), contents),
    lines: (file) => (exists(file) ? bytes(file).toString('utf8').split('\n').filter(Boolean) : []),
  };
}

const sarif = (name, results) =>
  JSON.stringify({ runs: [{ tool: { driver: { name } }, results }] });

function resultAt(uri, index, fields) {
  return {
    ...fields,
    locations: [
      { physicalLocation: { artifactLocation: { uri }, region: { startLine: index + 3 } } },
    ],
  };
}

function writeKotlinReports(run, report, { kotlinFile, inside }) {
  const { files } = run;
  const detekt = (line, index) => {
    const named = line.includes(' :: ');
    return resultAt(kotlinFile, index, {
      ruleId: named ? line.split(' :: ')[0] : 'detekt.style.MagicNumber',
      level: 'warning',
      message: { text: named ? line.split(' :: ')[1] : line },
    });
  };
  const ktlint = (line, index) =>
    resultAt(kotlinFile, index, {
      ruleId: line.split('|')[0],
      level: 'error',
      message: { text: line.split('|')[1] },
    });
  writeFileSync(report('detekt.sarif'), sarif('detekt', files.lines('detekt.txt').map(detekt)));
  writeFileSync(report('ktlint.sarif'), sarif('ktlint', files.lines('ktlint.txt').map(ktlint)));
  writeFileSync(report('ktfmt.txt'), files.lines('kotlin-format.txt').join('\n'));
  const metrics = [inside('kotlin-metrics.json'), 'kotlin-metrics.json'].find(files.exists);
  if (metrics !== undefined) {
    writeFileSync(report('kotlin-metrics.json'), files.bytes(metrics));
  }
}

function writeJavaReports(run, report, inside) {
  const { files } = run;
  const violation = (text, index) =>
    resultAt(inside('src/main/java/demo/A.java'), index, {
      ruleId: 'UnusedPrivateField',
      message: { text },
    });
  writeFileSync(report('pmd.sarif'), sarif('PMD', files.lines('violations.txt').map(violation)));
  writeFileSync(report('spotbugs.sarif'), sarif('SpotBugs', []));
  writeFileSync(report('format.txt'), '');
  writeFileSync(
    report('checkstyle.xml'),
    files.exists('checkstyle-report.xml')
      ? files.bytes('checkstyle-report.xml')
      : '<checkstyle version="10.21.1"></checkstyle>',
  );
  writeFileSync(report('structure.json'), '[]');
  writeFileSync(report('classes.json'), '{"files":{},"classes":[]}');
}

function writeModule(run, { key, dir }) {
  const { files, reportBase, kotlin } = run;
  const report = (name) => {
    const file = path.join(files.at(reportBase), key, name);
    mkdirSync(path.dirname(file), { recursive: true });
    return file;
  };
  const inside = (file) => (dir === '' ? file : `${dir}/${file}`);
  writeFileSync(
    report('manifest.json'),
    JSON.stringify({
      versions: {},
      sourceRoots: [inside('src/main/java')],
      ...(kotlin && {
        kotlin: true,
        kotlinSourceRoots: [inside('src/main/kotlin')],
        kotlinFormatter: run.formatter ?? 'none',
      }),
    }),
  );
  if (files.lines('EMPTY_MODULES').includes(dir)) {
    return;
  }
  if (kotlin) {
    writeKotlinReports(run, report, { kotlinFile: inside('src/main/kotlin/demo/K.kt'), inside });
  }
  writeJavaReports(run, report, inside);
  if (!files.lines('NO_JACOCO_IN').includes(dir === '' ? '.' : dir)) {
    writeFileSync(
      report('jacoco.xml'),
      files.exists('jacoco.xml') ? files.bytes('jacoco.xml') : '<report name="demo"></report>',
    );
  }
  if (files.exists('MAIN_CLASSES')) {
    writeFileSync(report('jdeps-classes.txt'), 'demo.A\n');
  }
  for (const name of ['jdeps.txt', 'jdeps-classes.txt', 'jdeps-test.txt']) {
    const source = [inside(name), inside(`jdeps/${name}`)].find(files.exists);
    if (source !== undefined) {
      writeFileSync(report(name), files.bytes(source));
    }
  }
  if (files.exists(inside('test-results'))) {
    cpSync(files.at(inside('test-results')), path.join(path.dirname(report('x')), 'test-results'), {
      recursive: true,
    });
  }
  if (files.exists('mutations.xml')) {
    writeFileSync(report('pit/mutations.xml'), files.bytes('mutations.xml'));
  }
}

function argumentValue(args, name) {
  const found = args.find((argument) => argument.startsWith(`${name}=`));
  return found?.slice(name.length + 1);
}

function writeProperties({ files }, args) {
  const exported = argumentValue(args, '-Pnitpicker.checkstyle.exportConfig');
  if (exported !== undefined) {
    files.write(exported, '<module name="Checker"/>');
  }
  const styleFile = argumentValue(args, '-Pnitpicker.kotlin.styleFile');
  if (styleFile !== undefined) {
    files.write('build/style-file.json', files.bytes(styleFile));
  }
}

export function runFakeGradle({ args, cwd }) {
  const files = filesIn(cwd);
  const stdout = files.exists('GRADLE_STDOUT') ? files.read('GRADLE_STDOUT') : '';
  if (files.exists('GRADLE_FAIL')) {
    return { status: 1, stdout, stderr: `${files.read('GRADLE_FAIL')}\n` };
  }
  const run = {
    files,
    reportBase: argumentValue(args, '-Pnitpicker.reportDir'),
    kotlin: args.includes('-Pnitpicker.kotlin=true'),
    formatter: argumentValue(args, '-Pnitpicker.kotlin.formatter'),
  };
  const modules = files.exists('NO_REPORTS')
    ? []
    : [
        { key: 'root', path: ':', dir: '' },
        ...files
          .lines('modules.txt')
          .map((dir) => ({ key: `module-${dir}`, path: `:${dir}`, dir })),
      ];
  mkdirSync(files.at(run.reportBase), { recursive: true });
  mkdirSync(files.at('build'), { recursive: true });
  files.write('build/gradle-args.json', JSON.stringify(args));
  appendFileSync(files.at('build/gradle-calls.jsonl'), `${JSON.stringify(args)}\n`);
  writeProperties(run, args);
  files.write(path.join(run.reportBase, 'modules.json'), JSON.stringify(modules));
  for (const module of modules) {
    writeModule(run, module);
  }
  return { status: 0, stdout, stderr: '' };
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename) {
  const { status, stdout, stderr } = runFakeGradle({
    args: process.argv.slice(2),
    cwd: process.cwd(),
  });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = status;
}
