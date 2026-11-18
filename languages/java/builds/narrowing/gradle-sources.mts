import path from 'node:path';
import { gradleStatements, quotedGroups } from './gradle-script.mts';
import { taskFilter } from './gradle-tasks.mts';
import { excludeCovers, includeScope } from './source-patterns.mts';
import type {
  FileReader,
  FilterEntry,
  GradleStatement,
  RootsEntry,
  SourceEntry,
  TaskFilter,
} from '../typed/narrowing-types.mts';

type DeclaredRoots = {
  readonly set: string;
  readonly language: string;
  readonly roots: string[];
  readonly replaces: boolean;
};
type SetState = { readonly replaced: Map<string, string[]>; readonly added: string[] };
type FoundFilter = TaskFilter & { readonly patterns: string[] };

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

function inModule(module: string, value: string): string {
  return module === '.' ? value : path.posix.join(module, value);
}

function resolvedRoot(module: string, value: string): string | undefined {
  const absolute = ROOT_DIRECTORY.test(value);
  const relative = path.posix.normalize(value.replace(ROOT_PREFIX, ''));
  if (relative.includes('$') || relative.startsWith('/') || relative.startsWith('..')) {
    return undefined;
  }
  return absolute ? relative : inModule(module, relative);
}

function sourceSetOf(composed: string): string | undefined {
  const found = SOURCE_SET_NAME.exec(composed);
  return found === null ? undefined : (found[1] ?? found[2] ?? found[3]);
}

function declaredRoots(
  { path: headers, text }: GradleStatement,
  module: string,
): DeclaredRoots | undefined {
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
    roots: quotedGroups(text.slice(keyword), QUOTED)
      .map((value) => resolvedRoot(module, value))
      .filter((root) => root !== undefined),
    replaces: REPLACES_ROOTS.test(bare) && !ADDS_ONLY.test(bare),
  };
}

function defaultRoot(module: string, set: string, language: string): string {
  return inModule(module, `src/${set}/${language}`);
}

function addDeclared(declared: Map<string, SetState>, found: DeclaredRoots): void {
  const state: SetState = declared.get(found.set) ?? { replaced: new Map(), added: [] };
  if (found.replaces) {
    state.replaced.set(found.language, found.roots);
  } else {
    for (const root of found.roots) {
      state.added.push(root);
    }
  }
  declared.set(found.set, state);
}

function rootsEntries(
  module: string,
  file: string,
  statements: readonly GradleStatement[],
): RootsEntry[] {
  const declared = new Map<string, SetState>();
  for (const statement of statements) {
    const found = declaredRoots(statement, module);
    if (found !== undefined) {
      addDeclared(declared, found);
    }
  }
  const sets = [...new Set([...DEFAULT_SETS, ...declared.keys()])];
  return sets.map((set) => {
    const state: SetState = declared.get(set) ?? { replaced: new Map(), added: [] };
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

function filtersOf(statements: readonly GradleStatement[]): [string, FoundFilter][] {
  const found = new Map<string, FoundFilter>();
  for (const statement of statements) {
    const filter = taskFilter(statement);
    if (filter !== undefined) {
      const key = [filter.action, filter.group, filter.kind].join(':');
      const patterns =
        filter.disabled === true ? ['enabled = false'] : quotedGroups(filter.text, QUOTED);
      const known: FoundFilter = found.get(key) ?? { ...filter, patterns: [] };
      found.set(key, { ...known, patterns: [...known.patterns, ...patterns] });
    }
  }
  return [...found];
}

function filterEntries(
  {
    module,
    file,
    statements,
  }: {
    readonly module: string;
    readonly file: string;
    readonly statements: readonly GradleStatement[];
  },
  entries: readonly RootsEntry[],
): FilterEntry[] {
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

export function readGradleSources(files: readonly string[], readFile: FileReader): SourceEntry[] {
  return files
    .filter((file) => /(?:^|\/)build\.gradle(?:\.kts)?$/u.test(file))
    .flatMap((file) => {
      const module = path.posix.dirname(file);
      const statements = gradleStatements(readFile(file) ?? '');
      const roots = rootsEntries(module, file, statements);
      return [...roots, ...filterEntries({ module, file, statements }, roots)];
    });
}
