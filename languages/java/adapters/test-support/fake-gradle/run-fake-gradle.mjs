import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const FIRST_REPORTED_LINE = 3;

function at(run, file) {
  return path.resolve(run.cwd, file);
}

function exists(run, file) {
  return existsSync(at(run, file));
}

function bytes(run, file) {
  return readFileSync(at(run, file));
}

function lines(run, file) {
  return exists(run, file) ? bytes(run, file).toString('utf8').split('\n').filter(Boolean) : [];
}

function put(run, file, contents) {
  writeFileSync(at(run, file), contents);
}

function sarif(name, results) {
  return JSON.stringify({ runs: [{ tool: { driver: { name } }, results }] });
}

function resultAt(uri, index, fields) {
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

function detektResult(kotlinFile, line, index) {
  const named = line.includes(' :: ');
  return resultAt(kotlinFile, index, {
    ruleId: named ? line.split(' :: ')[0] : 'detekt.style.MagicNumber',
    level: 'warning',
    message: { text: named ? line.split(' :: ')[1] : line },
  });
}

function ktlintResult(kotlinFile, line, index) {
  return resultAt(kotlinFile, index, {
    ruleId: line.split('|')[0],
    level: 'error',
    message: { text: line.split('|')[1] },
  });
}

function moduleFile(module, name) {
  const file = `${module.dirPath}/${name}`;
  mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

function inside(module, file) {
  return module.dir === '' ? file : `${module.dir}/${file}`;
}

function writeKotlinReports(module) {
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
  const metrics = [inside(module, 'kotlin-metrics.json'), 'kotlin-metrics.json'].find((file) =>
    exists(run, file),
  );
  if (metrics !== undefined) {
    writeFileSync(moduleFile(module, 'kotlin-metrics.json'), bytes(run, metrics));
  }
  const facts = [inside(module, 'kotlin-mutation-facts.json'), 'kotlin-mutation-facts.json'].find(
    (file) => exists(run, file),
  );
  if (facts !== undefined) {
    writeFileSync(moduleFile(module, 'kotlin-mutation-facts.json'), bytes(run, facts));
  }
}

function writeJavaReports(module) {
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
    moduleFile(module, 'structure.json'),
    exists(run, inside(module, 'structure.json'))
      ? bytes(run, inside(module, 'structure.json'))
      : '[]',
  );
  writeFileSync(moduleFile(module, 'classes.json'), '{"files":{},"classes":[]}');
}

function copyJdeps(module) {
  const { run } = module;
  for (const name of ['jdeps.txt', 'jdeps-classes.txt', 'jdeps-test.txt']) {
    const source = [inside(module, name), inside(module, `jdeps/${name}`)].find((file) =>
      exists(run, file),
    );
    if (source !== undefined) {
      writeFileSync(moduleFile(module, name), bytes(run, source));
    }
  }
}

function writeExtras(module) {
  const { run } = module;
  if (!lines(run, 'NO_JACOCO_IN').includes(module.dir === '' ? '.' : module.dir)) {
    writeFileSync(
      moduleFile(module, 'jacoco.xml'),
      exists(run, 'jacoco.xml') ? bytes(run, 'jacoco.xml') : '<report name="demo"></report>',
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

function manifestOf(module) {
  const { run } = module;
  return {
    versions: {},
    sourceRoots: [inside(module, 'src/main/java')],
    ...(run.kotlin && {
      kotlin: true,
      kotlinSourceRoots: [inside(module, 'src/main/kotlin')],
      kotlinFormatter: run.formatter ?? 'none',
    }),
  };
}

function writeModule(run, { key, dir }) {
  const module = { run, dir, dirPath: `${at(run, run.reportBase)}/${key}` };
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

function argumentValue(args, name) {
  const found = args.find((argument) => argument.startsWith(`${name}=`));
  return found?.slice(name.length + 1);
}

function writeProperties(run, args) {
  const exported = argumentValue(args, '-Pnitpicker.checkstyle.exportConfig');
  if (exported !== undefined) {
    put(run, exported, '<module name="Checker"/>');
  }
  const styleFile = argumentValue(args, '-Pnitpicker.kotlin.styleFile');
  if (styleFile !== undefined) {
    put(run, 'build/style-file.json', bytes(run, styleFile));
  }
}

function modulesOf(run) {
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

export function runFakeGradle({ args, cwd }) {
  const run = {
    cwd,
    reportBase: argumentValue(args, '-Pnitpicker.reportDir'),
    kotlin: args.includes('-Pnitpicker.kotlin=true'),
    formatter: argumentValue(args, '-Pnitpicker.kotlin.formatter'),
  };
  const stdout = exists(run, 'GRADLE_STDOUT') ? readFileSync(at(run, 'GRADLE_STDOUT'), 'utf8') : '';
  if (exists(run, 'GRADLE_FAIL')) {
    return { status: 1, stdout, stderr: `${readFileSync(at(run, 'GRADLE_FAIL'), 'utf8')}\n` };
  }
  const modules = modulesOf(run);
  mkdirSync(at(run, run.reportBase), { recursive: true });
  mkdirSync(at(run, 'build'), { recursive: true });
  put(run, 'build/gradle-args.json', JSON.stringify(args));
  appendFileSync(at(run, 'build/gradle-calls.jsonl'), `${JSON.stringify(args)}\n`);
  writeProperties(run, args);
  put(run, `${run.reportBase}/modules.json`, JSON.stringify(modules));
  for (const module of modules) {
    writeModule(run, module);
  }
  return { status: 0, stdout, stderr: '' };
}
