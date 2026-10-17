import path from 'node:path';
import { gradleStatements } from './gradle-script.mjs';
import { excludeCovers } from './source-patterns.mjs';

const QUOTED = /"([^"\n]*)"|'([^'\n]*)'/gu;
const SOURCE_SET_NAME =
  /sourceSets(?:\.(?:named|getByName|create|register|maybeCreate)\(\s*["'](\w+)["']\s*\)|\[\s*["'](\w+)["']\s*\]|\.(\w+))/u;
const LANGUAGE = /\b(kotlin|java|groovy|scala)\b/u;
const SRC_DIRS = /srcDirs?|setSrcDirs/u;
const REPLACES_ROOTS = /\bsrcDirs\s*=(?!=)|\bsetSrcDirs\s*\(/u;
const ADDS_ONLY = /\bsrcDirs?\s*\+=/u;
const ROOT_PREFIX = /^\$\{?(?:project\.)?(?:projectDir|rootDir)\}?\/?/u;
const ROOT_DIRECTORY = /^\$\{?rootDir\}?/u;
const TEST_TASK_HEADERS = [
  /^(?:tasks\.)?(?:test|\w*Test)$/u,
  /withType\s*[(<]\s*Test\b/u,
  /(?:named|register|create|getByName)\s*(?:<\s*Test\s*>\s*)?\(\s*["']\w*[tT]est\w*["']/u,
  /^task\s+\w*[tT]est\w*\s*\(.*type\s*:\s*Test/u,
];
const EXCLUDE = /^(?:[\w.]+\.)?(?:exclude|setExcludes)\b(?!\s*(?:group|module)\s*[:=])/u;
const EXCLUDES_ASSIGNED = /^(?:[\w.]+\.)?excludes\s*\+?=/u;
const NAME_EXCLUDE = /^(?:[\w.]+\.)?excludeTestsMatching\b/u;
const TAG_EXCLUDE = /^(?:[\w.]+\.)?(?:excludeTags|excludeEngines|excludeCategories)\b/u;
const DISABLED = /^(?:enabled|isEnabled)\s*=\s*false$/u;
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

function isTestTask(headers) {
  return headers.some((header) => TEST_TASK_HEADERS.some((pattern) => pattern.test(header)));
}

function excludeKind({ path: headers, text }) {
  const inSourceSets = headers.some((header) => /^(?:\w+\.)?sourceSets\b/u.test(header));
  if (inSourceSets && (EXCLUDE.test(text) || EXCLUDES_ASSIGNED.test(text))) {
    return 'source';
  }
  if (!isTestTask(headers)) {
    return undefined;
  }
  if (EXCLUDE.test(text) || EXCLUDES_ASSIGNED.test(text)) {
    return 'test';
  }
  if (NAME_EXCLUDE.test(text)) {
    return 'name';
  }
  return TAG_EXCLUDE.test(text) || DISABLED.test(text) ? 'tag' : undefined;
}

function excludesOf(statements) {
  const found = new Map();
  for (const statement of statements) {
    const kind = excludeKind(statement);
    if (kind !== undefined) {
      const patterns = DISABLED.test(statement.text)
        ? ['enabled = false']
        : quotedValues(statement.text);
      found.set(kind, [...(found.get(kind) ?? []), ...patterns]);
    }
  }
  return found;
}

function excludeEntries({ module, file, statements }, entries) {
  return [...excludesOf(statements)].map(([kind, patterns]) => ({
    type: 'excludes',
    key: `gradle:${module}:exclude:${kind}`,
    file,
    label: `Gradle ${kind === 'source' ? 'source set' : 'test'} excludes in ${file}`,
    patterns: [...new Set(patterns)],
    covers: excludeCovers(kind, entries),
  }));
}

export function readGradleSources(files, readFile) {
  return files
    .filter((file) => /(?:^|\/)build\.gradle(?:\.kts)?$/u.test(file))
    .flatMap((file) => {
      const module = path.posix.dirname(file);
      const statements = gradleStatements(readFile(file));
      const roots = rootsEntries(module, file, statements);
      return [...roots, ...excludeEntries({ module, file, statements }, roots)];
    });
}
