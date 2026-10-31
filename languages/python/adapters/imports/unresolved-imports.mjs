import path from 'node:path';
import {
  buildsExtensions,
  declaredNames,
  isCheckedFile,
  isDeclared,
  isGeneratedModule,
} from './import-names.mjs';
import { createModuleFiles } from './module-files.mjs';

const UNRESOLVED_RULE = 'unresolved-import';
const ALWAYS_PRESENT = ['__future__', '__main__'];

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
  const entries = [
    ...imports.modules,
    ...(imports.others ?? []).filter(({ kind }) => kind === 'test'),
  ].filter(isCheckedFile);
  return [...new Map(entries.map((entry) => [entry.file, entry])).values()];
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

function topDirectory({ file, module }) {
  const parts = file.replace(/\.py$/u, '').split('/');
  const segments = parts.at(-1) === '__init__' ? parts.slice(0, -1) : parts;
  return segments.slice(0, segments.length - module.split('.').length + 1).join('/');
}

function packageDirectories(imports, files) {
  const directories = new Map();
  function add(top, directory) {
    if (files.isRegularPackage(directory)) {
      directories.set(top, new Set([...(directories.get(top) ?? []), directory]));
    }
  }
  for (const entry of imports.modules) {
    add(entry.module.split('.')[0], topDirectory(entry));
  }
  for (const { file, module } of imports.others ?? []) {
    if (file === `${module}/__init__.py` && !directories.has(module)) {
      add(module, module);
    }
  }
  return directories;
}

function rewiredPackages(imports, files) {
  return new Set(
    imports.modules
      .filter(({ file }) => files.rewires(file))
      .map(({ module }) => module.split('.')[0]),
  );
}

function besideImporter(files, file, top) {
  const parts = path.posix
    .dirname(file)
    .split('/')
    .filter((part) => part !== '.');
  return parts
    .map((_, index) => parts.slice(0, parts.length - index).join('/'))
    .concat('.')
    .some((directory) => files.hasModule(directory, top));
}

function relativeStart(file, level) {
  const parts = path.posix
    .dirname(file)
    .split('/')
    .filter((part) => part !== '.');
  return level - 1 >= parts.length
    ? undefined
    : parts.slice(0, parts.length - (level - 1)).join('/');
}

function existsInProject(project, relative, parts) {
  const missing = project.files.missingPart(relative, parts);
  if (missing === -1 || isGeneratedModule(parts[missing])) {
    return true;
  }
  return missing === parts.length - 1 && project.buildsExtensions;
}

function resolverOf({ projectRoot, imports, scan, declared }) {
  const known = new Set([
    ...(scan.stdlib ?? []),
    ...ALWAYS_PRESENT,
    ...Object.keys(scan.modules ?? {}),
    ...scan.importable,
    ...projectNames(imports),
  ]);
  const environmentInstalled = Object.keys(scan.modules ?? {}).length > 0;
  const names = declaredNames(projectRoot, declared);
  const stdlib = new Set(scan.stdlib ?? []);
  const files = createModuleFiles(projectRoot);
  const packages = packageDirectories(imports, files);
  const rewired = rewiredPackages(imports, files);
  const project = { files, buildsExtensions: buildsExtensions(projectRoot) };
  function isKnownTop(file, top) {
    return (
      !environmentInstalled ||
      known.has(top) ||
      isDeclared(names, top) ||
      besideImporter(files, file, top)
    );
  }
  function absolute(file, name) {
    const [top, ...rest] = name.split('.');
    if (!isKnownTop(file, top)) {
      return false;
    }
    const directories = packages.get(top);
    return (
      directories === undefined ||
      stdlib.has(top) ||
      rewired.has(top) ||
      [...directories].some((directory) => existsInProject(project, directory, rest))
    );
  }
  function relative(file, { level, module }) {
    const start = relativeStart(file, level);
    return start === undefined || existsInProject(project, start, module.split('.'));
  }
  const answers = new Map();
  return (file, statement, name) => {
    const key = `${String(statement.level)}|${path.posix.dirname(file)}|${name}`;
    if (!answers.has(key)) {
      answers.set(key, statement.level === 0 ? absolute(file, name) : relative(file, statement));
    }
    return answers.get(key);
  };
}

function specifier(statement, name) {
  return `${'.'.repeat(statement.level)}${name}`;
}

function finding({ file, statement, name }, manifest) {
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
    function checked(statement) {
      return isChecked(statement) && !(kind === 'test' && statement.local === true);
    }
    return (imports.imports[file] ?? []).filter(checked).flatMap((statement) =>
      dottedNames(statement).flatMap((name) => {
        const spec = specifier(statement, name);
        if (seen.has(spec) || resolves(file, statement, name)) {
          return [];
        }
        seen.add(spec);
        return [finding({ file, statement, name }, declared.manifest)];
      }),
    );
  });
}
