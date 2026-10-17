#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function runFakeGradle({ args, cwd }) {
  const at = (file) => path.resolve(cwd, file);
  const exists = (file) => existsSync(at(file));
  const read = (file) => readFileSync(at(file), 'utf8');
  const readBytes = (file) => readFileSync(at(file));
  const write = (file, contents) => writeFileSync(at(file), contents);
  if (exists('GRADLE_FAIL')) {
    return { status: 1, stdout: '', stderr: `${read('GRADLE_FAIL')}\n` };
  }
  const reportBase = args
    .find((argument) => argument.startsWith('-Pnitpicker.reportDir='))
    ?.split('=')[1];
  const lines = (file) => (exists(file) ? read(file).split('\n').filter(Boolean) : []);
  const sarif = (name, results) =>
    JSON.stringify({ runs: [{ tool: { driver: { name } }, results }] });
  const kotlin = args.includes('-Pnitpicker.kotlin=true');
  const formatterArgument = args.find((argument) =>
    argument.startsWith('-Pnitpicker.kotlin.formatter='),
  );

  function resultAt(uri, index, fields) {
    return {
      ...fields,
      locations: [
        { physicalLocation: { artifactLocation: { uri }, region: { startLine: index + 3 } } },
      ],
    };
  }

  function writeKotlinReports(report, { kotlinFile, inside }) {
    writeFileSync(
      report('detekt.sarif'),
      sarif(
        'detekt',
        lines('detekt.txt').map((line, index) =>
          resultAt(kotlinFile, index, {
            ruleId: line.includes(' :: ') ? line.split(' :: ')[0] : 'detekt.style.MagicNumber',
            level: 'warning',
            message: { text: line.includes(' :: ') ? line.split(' :: ')[1] : line },
          }),
        ),
      ),
    );
    writeFileSync(
      report('ktlint.sarif'),
      sarif(
        'ktlint',
        lines('ktlint.txt').map((line, index) =>
          resultAt(kotlinFile, index, {
            ruleId: line.split('|')[0],
            level: 'error',
            message: { text: line.split('|')[1] },
          }),
        ),
      ),
    );
    writeFileSync(report('ktfmt.txt'), lines('kotlin-format.txt').join('\n'));
    const metrics = [inside('kotlin-metrics.json'), 'kotlin-metrics.json'].find((file) =>
      exists(file),
    );
    if (metrics !== undefined) {
      writeFileSync(report('kotlin-metrics.json'), readBytes(metrics));
    }
  }

  function writeModule({ key, dir }) {
    const report = (name) => {
      const file = path.join(at(reportBase), key, name);
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
          kotlinFormatter: formatterArgument?.split('=')[1] ?? 'none',
        }),
      }),
    );
    if (lines('EMPTY_MODULES').includes(dir)) {
      return;
    }
    if (kotlin) {
      writeKotlinReports(report, { kotlinFile: inside('src/main/kotlin/demo/K.kt'), inside });
    }
    writeFileSync(
      report('pmd.sarif'),
      sarif(
        'PMD',
        lines('violations.txt').map((text, index) =>
          resultAt(inside('src/main/java/demo/A.java'), index, {
            ruleId: 'UnusedPrivateField',
            message: { text },
          }),
        ),
      ),
    );
    writeFileSync(report('spotbugs.sarif'), sarif('SpotBugs', []));
    writeFileSync(report('format.txt'), '');
    writeFileSync(report('checkstyle.xml'), '<checkstyle version="10.21.1"></checkstyle>');
    if (!lines('NO_JACOCO_IN').includes(dir === '' ? '.' : dir)) {
      writeFileSync(
        report('jacoco.xml'),
        exists('jacoco.xml') ? readBytes('jacoco.xml') : '<report name="demo"></report>',
      );
    }
    if (exists('MAIN_CLASSES')) {
      writeFileSync(report('jdeps-classes.txt'), 'demo.A\n');
    }
    for (const name of ['jdeps.txt', 'jdeps-classes.txt']) {
      if (exists(inside(name))) {
        writeFileSync(report(name), readBytes(inside(name)));
      }
    }
    if (exists('mutations.xml')) {
      writeFileSync(report('pit/mutations.xml'), readBytes('mutations.xml'));
    }
    writeFileSync(report('structure.json'), '[]');
    writeFileSync(report('classes.json'), '{"files":{},"classes":[]}');
  }

  const modules = exists('NO_REPORTS')
    ? []
    : [
        { key: 'root', path: ':', dir: '' },
        ...lines('modules.txt').map((dir) => ({ key: `module-${dir}`, path: `:${dir}`, dir })),
      ];
  mkdirSync(at(reportBase), { recursive: true });
  mkdirSync(at('build'), { recursive: true });
  write('build/gradle-args.json', JSON.stringify(args));
  writeFileSync(path.join(at(reportBase), 'modules.json'), JSON.stringify(modules));
  for (const module of modules) {
    writeModule(module);
  }
  return { status: 0, stdout: '', stderr: '' };
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
