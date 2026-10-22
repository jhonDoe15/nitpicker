import path from 'node:path';
import { gradleStatements } from './gradle-script.mjs';
import { taskFilter } from './gradle-tasks.mjs';
import { excludeCovers, includeScope } from './source-patterns.mjs';

const QUOTED = /"([^"\n]*)"|'([^'\n]*)'/gu;
const SOURCE_SET_NAME =
  /sourceSets(?:\.(?:named|getByName|create|register|maybeCreate)\(\s*["'](\w+)["']\s*\)|\[\s*["'](\w+)["']\s*\]|\.(\w+))/u;
const LANGUAGE = /\b(kotlin|java|groovy|scala)\b/u;
const SRC_DIRS = /srcDirs?|setSrcDirs/u;
const REPLACES_ROOTS = /\bsrcDirs\s*=(?!=)|\bsetSrcDirs\s*\(/u;
const ADDS_ONLY = /\bsrcDirs?\s*\+=/u;
const ROOT_PREFIX = /^\$\{?(?:project\.)?(?:projectDir|rootDir)\}?\/?/u;
const ROOT_DIRECTORY = /^\$\{?rootDir\}?/u;
const DEFAULT_SETS = ['main', 'test'];
const LANGUAGES = ['java', 'kotlin'];

function quotedValues(text) {
  return [...text.matchAll(QUOTED)].map((match) => match[1] ?? match[2]);
}

function inModule(module, value) {
  return module === '.' ? value : path.posix.join(module, value);
}

function resolvedRoot(module, value) {
  const absolute = ROOT_DIRECTORY.test(value);
  const relative = path.posix.normalize(value.replace(ROOT_PREFIX, ''));
  if (relative.includes('$') || relative.startsWith('/') || relative.startsWith('..')) {
    return undefined;
  }
  return absolute ? relative : inModule(module, relative);
}

function sourceSetOf(composed) {
  const found = SOURCE_SET_NAME.exec(composed);
  return found === null ? undefined : (found[1] ?? found[2] ?? found[3]);
}

function declaredRoots({ path: headers, text }, module) {
  const composed = [...headers, text].join('.');
  const bare = composed.replaceAll(QUOTED, '""');
  const language =
    LANGUAGE.exec(bare.slice(Math.max(0, bare.indexOf('sourceSets'))))?.[1] ?? 'java';
  const set = sourceSetOf(composed);
  const keyword = text.search(SRC_DIRS);
  if (
    set === undefined ||
    keyword === -1 ||
    !LANGUAGES.includes(language) ||
    /\bresources\b/u.test(bare)
  ) {
    return undefined;
  }
  return {
    set,
    language,
    roots: quotedValues(text.slice(keyword))
      .map((value) => resolvedRoot(module, value))
      .filter((root) => root !== undefined),
    replaces: REPLACES_ROOTS.test(bare) && !ADDS_ONLY.test(bare),
  };
}

function defaultRoot(module, set, language) {
  return inModule(module, `src/${set}/${language}`);
}

function addDeclared(declared, found) {
  const state = declared.get(found.set) ?? { replaced: new Map(), added: [] };
  if (found.replaces) {
    state.replaced.set(found.language, found.roots);
  } else {
    state.added.push(...found.roots);
  }
  declared.set(found.set, state);
}

function rootsEntries(module, file, statements) {
  const declared = new Map();
  for (const statement of statements) {
    const found = declaredRoots(statement, module);
    if (found !== undefined) {
      addDeclared(declared, found);
    }
  }
  const sets = [...new Set([...DEFAULT_SETS, ...declared.keys()])];
  return sets.map((set) => {
    const state = declared.get(set) ?? { replaced: new Map(), added: [] };
    const roots = LANGUAGES.flatMap(
      (language) => state.replaced.get(language) ?? [defaultRoot(module, set, language)],
    );
    return {
      type: 'roots',
      key: `gradle:${module}:sourceSet:${set}`,
      file,
      label: `Gradle source set ${set} in ${file}`,
      set,
      roots: [...new Set([...roots, ...state.added])],
    };
  });
}

function filtersOf(statements) {
  const found = new Map();
  for (const statement of statements) {
    const filter = taskFilter(statement);
    if (filter !== undefined) {
      const key = [filter.action, filter.group, filter.kind].join(':');
      const patterns = filter.disabled === true ? ['enabled = false'] : quotedValues(filter.text);
      const known = found.get(key) ?? { ...filter, patterns: [] };
      found.set(key, { ...known, patterns: [...known.patterns, ...patterns] });
    }
  }
  return [...found];
}

function filterEntries({ module, file, statements }, entries) {
  return filtersOf(statements).map(([key, filter]) => ({
    type: filter.action === 'exclude' ? 'excludes' : 'includes',
    key: `gradle:${module}:${key}`,
    file,
    label: `Gradle ${filter.group} ${filter.action}s in ${file}`,
    patterns: [...new Set(filter.patterns)],
    covers: excludeCovers(filter.kind, entries),
    ...(filter.action === 'include' ? includeScope(filter.kind, entries) : {}),
  }));
}

export function readGradleSources(files, readFile) {
  return files
    .filter((file) => /(?:^|\/)build\.gradle(?:\.kts)?$/u.test(file))
    .flatMap((file) => {
      const module = path.posix.dirname(file);
      const statements = gradleStatements(readFile(file));
      const roots = rootsEntries(module, file, statements);
      return [...roots, ...filterEntries({ module, file, statements }, roots)];
    });
}
