import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { normalizeRequirementName } from '../../libraries/python-dependencies.mjs';

const UNRESOLVED_RULE = 'unresolved-import';
const TOOL_RUN_FILES = new Set(['setup.py', 'noxfile.py', 'fabfile.py', 'dodo.py', 'pavement.py']);
const ALWAYS_PRESENT = ['__future__', '__main__'];
const MODULE_FILE = /\.(?:py|pyi|pyw|pyx|pxd|pyc|so|pyd)$/u;
const PACKAGE_REWIRING = /__path__|sys\.modules|declare_namespace/u;
const INIT = '__init__.py';
const DECLARED_FORMS = ['*', '*-py', 'py*', 'py-*', 'python-*', '*-python'];

function isChecked(statement) {
  return statement.typeOnly !== true && statement.guarded !== true;
}

function dottedNames(statement) {
  if (statement.level > 0) {
    return statement.module === null ? [] : [statement.module];
  }
  return statement.module === null ? statement.names : [statement.module];
}

export function probedTops(imports) {
  const tops = Object.values(imports.imports ?? {}).flatMap((statements) =>
    statements
      .filter((statement) => isChecked(statement) && statement.level === 0)
      .flatMap((statement) => dottedNames(statement).map((name) => name.split('.')[0])),
  );
  return [...new Set(tops)].sort();
}

function checkedFiles(imports) {
  return [
    ...imports.modules.filter(({ file }) => !TOOL_RUN_FILES.has(file)),
    ...(imports.others ?? []).filter(({ kind }) => kind === 'test'),
  ];
}

function projectNames(imports) {
  const files = [...imports.modules, ...(imports.others ?? [])].map(({ file }) => file);
  return new Set(
    files.flatMap((file) =>
      file
        .replace(/\.py$/u, '')
        .split('/')
        .filter((part) => part !== '__init__'),
    ),
  );
}

function packageDirectories(imports) {
  const directories = new Map();
  for (const { file, module, isPackage } of imports.modules) {
    if (isPackage && !module.includes('.')) {
      directories.set(module, path.posix.dirname(file));
    }
  }
  for (const { file, module } of imports.others ?? []) {
    if (file === `${module}/${INIT}` && !directories.has(module)) {
      directories.set(module, module);
    }
  }
  return directories;
}

function isDirectory(absolute) {
  return existsSync(absolute) && statSync(absolute).isDirectory();
}

function hasModule(projectRoot, directory, name, last) {
  const absolute = path.join(projectRoot, directory);
  if (isDirectory(path.join(absolute, name))) {
    return true;
  }
  return (
    last &&
    readdirSync(absolute).some((entry) => entry.startsWith(`${name}.`) && MODULE_FILE.test(entry))
  );
}

function rewires(projectRoot, file) {
  const absolute = path.join(projectRoot, file);
  return existsSync(absolute) && PACKAGE_REWIRING.test(readFileSync(absolute, 'utf8'));
}

function existsUnder(projectRoot, start, parts) {
  let directory = start;
  for (const [index, part] of parts.entries()) {
    if (rewires(projectRoot, path.posix.join(directory, INIT))) {
      return true;
    }
    if (!hasModule(projectRoot, directory, part, index === parts.length - 1)) {
      return rewires(projectRoot, path.posix.join(directory, `${part}.py`));
    }
    directory = path.posix.join(directory, part);
  }
  return true;
}

function relativeStart(file, level) {
  const parts = path.posix
    .dirname(file)
    .split('/')
    .filter((part) => part !== '.');
  return level - 1 > parts.length
    ? undefined
    : parts.slice(0, parts.length - (level - 1)).join('/');
}

function isDeclared(declaredNames, top) {
  const name = normalizeRequirementName(top);
  return DECLARED_FORMS.some((form) => declaredNames.has(form.replace('*', name)));
}

function resolverOf({ projectRoot, imports, scan, declared }) {
  const known = new Set([
    ...(scan.stdlib ?? []),
    ...ALWAYS_PRESENT,
    ...Object.keys(scan.modules ?? {}),
    ...scan.importable,
    ...projectNames(imports),
  ]);
  const declaredNames = new Set(declared.dependencies.map(({ normalized }) => normalized));
  const stdlib = new Set(scan.stdlib ?? []);
  const packages = packageDirectories(imports);
  function absolute(name) {
    const [top, ...rest] = name.split('.');
    if (!known.has(top) && !isDeclared(declaredNames, top)) {
      return false;
    }
    const directory = packages.get(top);
    return directory === undefined || stdlib.has(top) || existsUnder(projectRoot, directory, rest);
  }
  function relative(file, { level, module }) {
    const start = relativeStart(file, level);
    return start === undefined || existsUnder(projectRoot, start || '.', module.split('.'));
  }
  return (file, statement, name) =>
    statement.level === 0 ? absolute(name) : relative(file, statement);
}

function specifier(statement, name) {
  return `${'.'.repeat(statement.level)}${name}`;
}

function finding(file, statement, name, manifest) {
  const spec = specifier(statement, name);
  const fix =
    statement.level > 0
      ? 'Fix the module path'
      : `Fix the module name, or install the package and list it in ${manifest}`;
  return {
    tool: 'dependencies',
    rule: UNRESOLVED_RULE,
    path: file,
    identity: `unresolved:${spec}`,
    classification: 'enforceable',
    ...(statement.line === undefined ? {} : { location: { line: statement.line } }),
    message: `Import ${spec} resolves to no module or package. ${fix}`,
  };
}

export function unresolvedImportFindings({ projectRoot, imports, scan, declared }) {
  if (!Array.isArray(scan.importable)) {
    return [];
  }
  const resolves = resolverOf({ projectRoot, imports, scan, declared });
  return checkedFiles(imports).flatMap(({ file, kind }) => {
    const seen = new Set();
    const checked = (statement) => isChecked(statement) && !(kind === 'test' && statement.local);
    return (imports.imports[file] ?? []).filter(checked).flatMap((statement) =>
      dottedNames(statement).flatMap((name) => {
        const spec = specifier(statement, name);
        if (seen.has(spec) || resolves(file, statement, name)) {
          return [];
        }
        seen.add(spec);
        return [finding(file, statement, name, declared.manifest)];
      }),
    );
  });
}
