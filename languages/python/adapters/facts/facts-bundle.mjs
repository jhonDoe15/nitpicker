import path from 'node:path';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';

const INIT_FILE = '__init__.py';
const MAIN_FILE = '__main__.py';

function stemOf(file) {
  return file.endsWith(`/${INIT_FILE}`) || file === INIT_FILE
    ? path.posix.dirname(file).replace(/^\.$/, '')
    : file.replace(/\.py$/, '');
}

function createResolver(modules, files) {
  const stemToFile = new Map(files.map((file) => [stemOf(file), file]));
  const moduleToStem = new Map(modules.map(({ file, module }) => [module, stemOf(file)]));
  function moduleStem(name) {
    if (moduleToStem.has(name)) {
      return moduleToStem.get(name);
    }
    const child = [...moduleToStem.keys()].find((module) => module.startsWith(`${name}.`));
    if (child === undefined) {
      return undefined;
    }
    const extra = child.split('.').length - name.split('.').length;
    return moduleToStem.get(child).split('/').slice(0, -extra).join('/');
  }
  function baseStem(file, { level, module }) {
    if (level === 0) {
      return moduleStem(module);
    }
    const directory = Array.from({ length: level - 1 }).reduce(
      (current) => path.posix.dirname(current),
      path.posix.dirname(file),
    );
    const prefix = directory === '.' ? '' : directory;
    return module === null ? prefix : [prefix, ...module.split('.')].filter(Boolean).join('/');
  }
  return { fileOf: (stem) => stemToFile.get(stem), moduleStem, baseStem };
}

function named(name, alias) {
  return alias === null || alias === undefined || alias === name ? { name } : { name, alias };
}

function moduleImports(file, statement, resolver) {
  return statement.aliases.flatMap(({ name, alias }) => {
    const parts = name.split('.');
    const loads = parts.slice(0, -1).map((_, index) => ({
      to: resolver.fileOf(resolver.moduleStem(parts.slice(0, index + 1).join('.'))),
      names: [],
    }));
    const to = resolver.fileOf(resolver.moduleStem(name));
    return [...loads, { to, names: [named('*', alias)] }];
  });
}

function definesName(facts, name) {
  return facts?.definitions.some((definition) => definition.name === name) ?? false;
}

function fromImports(file, statement, { resolver, scanned }) {
  const stem = resolver.baseStem(file, statement);
  if (stem === undefined) {
    return [];
  }
  const target = resolver.fileOf(stem);
  const reexported = new Set(
    scanned[file].exports.reexports
      .filter(({ line }) => line === statement.line)
      .map(({ name }) => name),
  );
  return statement.aliases.map(({ name, alias }) => {
    const reexport = reexported.has(alias ?? name);
    const submodule = name === '*' ? undefined : resolver.fileOf(`${stem}/${name}`);
    if (submodule !== undefined && !definesName(scanned[target], name)) {
      return { to: submodule, names: [named('*', alias ?? name)], reexport };
    }
    return { to: target, names: [named(name, alias)], reexport };
  });
}

function mergedStatements(entries, statement, { file, role }) {
  const groups = new Map();
  for (const { to, names, reexport = false } of entries) {
    if (to === undefined) {
      continue;
    }
    const key = `${to}\0${String(reexport)}`;
    const group = groups.get(key) ?? { from: file, to, names: [], reexport, role };
    group.names.push(...names);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    line: statement.line,
    typeOnly: statement.typeOnly,
  }));
}

function importFacts(file, context) {
  const role = context.roleOf(file);
  return context.scanned[file].imports.flatMap((statement) => {
    const entries =
      statement.module === null && statement.level === 0
        ? moduleImports(file, statement, context.resolver)
        : fromImports(file, statement, context);
    return mergedStatements(entries, statement, { file, role });
  });
}

function definitionText({ tag, tokens }) {
  return `${tag}|${tokens.join(' ')}`;
}

function bindingText(file, { name: used, binding }, context) {
  if (binding.kind === 'local') {
    const local = context.scanned[file].definitions.find(({ name }) => name === used);
    return `local:${local === undefined ? '' : definitionText(local)}`;
  }
  const statement = { level: binding.level, module: binding.module };
  const stem =
    binding.kind === 'module'
      ? context.resolver.moduleStem(binding.module)
      : context.resolver.baseStem(file, statement);
  const source =
    context.resolver.fileOf(stem) ?? `external:${'.'.repeat(binding.level)}${binding.module}`;
  return binding.kind === 'module' ? `module:${source}` : `${source}#${binding.name}`;
}

function definitionFacts(file, context) {
  const entries = context.entryNames.get(file) ?? new Set();
  return context.scanned[file].definitions.map((definition) => {
    const free = definition.free.map((use) => `${use.name}=${bindingText(file, use, context)}`);
    const text = definitionText(definition);
    return {
      file,
      name: definition.name,
      kind: definition.kind,
      line: definition.line,
      lines: definition.lines,
      exported: definition.exported,
      tokens: definition.tokens,
      literal: definition.literal,
      usedLocally: definition.usedLocally,
      text,
      key: hash(`${text}|${free.join(',')}`),
      entry: entries.has(definition.name),
    };
  });
}

function entryPointNames(entryPoints, resolver) {
  const names = new Map();
  for (const entryPoint of entryPoints) {
    const [module, attribute = ''] = entryPoint.split(':');
    const file = resolver.fileOf(resolver.moduleStem(module));
    if (file !== undefined) {
      names.set(file, new Set([...(names.get(file) ?? []), attribute.split('.')[0]]));
    }
  }
  return names;
}

export function factsBundle({ modules, scanned, isTest, published = false, entryPoints = [] }) {
  const files = Object.keys(scanned).sort();
  const resolver = createResolver(modules, files);
  const entryNames = entryPointNames(entryPoints, resolver);
  function roleOf(file) {
    return isTest(file) ? 'test' : 'production';
  }
  const context = { resolver, scanned, roleOf, entryNames };
  const moduleNames = new Map(modules.map(({ file, module }) => [file, module]));
  return {
    modules: files.map((file) => ({
      file,
      role: roleOf(file),
      entry:
        scanned[file].script || path.posix.basename(file) === MAIN_FILE || entryNames.has(file),
      ...(moduleNames.has(file) ? { module: moduleNames.get(file) } : {}),
      qualifiedUses: scanned[file].qualifiedUses,
    })),
    packages: [{ root: '', published }],
    definitions: files.flatMap((file) => definitionFacts(file, context)),
    imports: files.flatMap((file) => importFacts(file, context)),
    docComments: files.flatMap((file) =>
      scanned[file].docComments.map(({ line, name, qualifiedName, lines }) => ({
        file,
        line,
        name,
        qualifiedName,
        lines,
      })),
    ),
  };
}
