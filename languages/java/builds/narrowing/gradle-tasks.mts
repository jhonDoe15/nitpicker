import type { GradleStatement, TaskFilter } from '../typed/narrowing-types.mts';

const EXCLUDE = 'exclude';
const INCLUDE = 'include';
const COMPILE = 'compile';
const TEST_SOURCE = 'testSource';
const TASKS = String.raw`(?:(?:project\.)?tasks\.)?`;
function typeArgument(types: string): string {
  return String.raw`(?:${types})(?:::class(?:\.java)?)?`;
}

function named(names: string): string {
  return String.raw`(?:named|getByName)\s*(?:<\s*\w+\s*>\s*)?\(\s*["'](?:${names})["']\s*(?:,\s*\w+(?:::class(?:\.java)?)?\s*)?\)`;
}

function withType(types: string): string {
  return String.raw`withType\s*(?:\(\s*${typeArgument(types)}\s*\)|<\s*(?:${types})\s*>(?:\s*\(\s*\))?)`;
}
const CONFIGURED = String.raw`(?:\.get\(\))?(?:\.(?:configure|configureEach|all)(?:\s*\(\s*\))?)?`;

function taskPattern(names: string, types?: string): string {
  const typed = types === undefined ? '' : `|${withType(types)}`;
  return String.raw`${TASKS}(?:${names}|${named(names)}${typed})${CONFIGURED}`;
}

const TARGETS = [
  { target: 'test', pattern: taskPattern('test', 'Test') },
  {
    target: COMPILE,
    pattern: taskPattern('compileJava|compileKotlin', 'JavaCompile|KotlinCompile|KotlinJvmCompile'),
  },
  { target: 'compileTest', pattern: taskPattern('compileTestJava|compileTestKotlin') },
].map(({ target, pattern }) => ({
  target,
  header: new RegExp(`^${pattern}$`, 'u'),
  receiver: new RegExp(`^${pattern}\\.(?!get\\(\\))(.+)$`, 'su'),
}));
const FILTER_BLOCKS = /^(?:filter|options|useJUnitPlatform|useJUnit|useTestNG|onlyIf)\b/u;

const SOURCE_SETS = /^(?:\w+\.)?sourceSets\b/u;
const RESOURCES = /\bresources\b/u;
const TEST_SET = /test/iu;
const ONLY_IF = /^(?:.+\.)?onlyIf$/u;
const DISABLED = /^(?:enabled|isEnabled)(?:\s*=\s*|\s+)false$|^setEnabled\s*\(\s*false\s*\)$/u;
const FILTERS = [
  {
    action: EXCLUDE,
    kind: 'files',
    pattern: /^(?:exclude|setExcludes)\b(?!\s*(?:\(\s*)?(?:group|module)\s*[:=])/u,
  },
  { action: EXCLUDE, kind: 'files', pattern: /^excludes\s*\+?=/u },
  { action: EXCLUDE, kind: 'name', pattern: /^excludeTestsMatching\b/u },
  {
    action: EXCLUDE,
    kind: 'tag',
    pattern: /^(?:excludeTags|excludeEngines|excludeCategories)\b/u,
  },
  { action: INCLUDE, kind: 'files', pattern: /^(?:include|setIncludes)\b/u },
  { action: INCLUDE, kind: 'files', pattern: /^includes\s*\+?=/u },
  { action: INCLUDE, kind: 'name', pattern: /^includeTestsMatching\b/u },
  {
    action: INCLUDE,
    kind: 'tag',
    pattern: /^(?:includeTags|includeEngines|includeCategories)\b/u,
  },
];
const WITHOUT_RECEIVER =
  /^(?:filter|options|useJUnitPlatform|useJUnit|useTestNG)\s*(?:\(\s*\))?\./u;

function taskTarget(headers: readonly string[]): string | undefined {
  for (const [index, text] of headers.entries()) {
    const found = TARGETS.find(({ header, receiver }) => header.test(text) || receiver.test(text));
    if (found !== undefined) {
      const nested = headers.slice(index + 1);
      return nested.every((inner) => FILTER_BLOCKS.test(inner)) ? found.target : undefined;
    }
  }
  return undefined;
}

function targetOfHeaders(headers: readonly string[]): string | undefined {
  const inSourceSets = headers.some((text) => SOURCE_SETS.test(text));
  if (!inSourceSets) {
    return taskTarget(headers);
  }
  if (headers.some((text) => RESOURCES.test(text))) {
    return undefined;
  }
  return headers.some((text) => TEST_SET.test(text)) ? TEST_SOURCE : 'source';
}

function withReceiver(text: string): { target: string; text: string } | undefined {
  for (const { target, receiver } of TARGETS) {
    const rest = receiver.exec(text)?.[1];
    if (rest !== undefined) {
      return { target, text: rest };
    }
  }
  return undefined;
}

function onlyIfFalse(headers: readonly string[], text: string): boolean {
  return text === 'false' && ONLY_IF.test(headers.at(-1) ?? '');
}

const GROUPS: Readonly<Record<string, string>> = {
  test: 'test',
  compile: COMPILE,
  compileTest: COMPILE,
  source: 'source set',
  testSource: 'source set',
};
const TEST_SOURCES = new Set(['compileTest', TEST_SOURCE]);

function kindFor(
  target: string,
  { action, kind }: { readonly action: string; readonly kind: string },
): string | undefined {
  if (target === 'test') {
    return kind === 'files' ? 'test' : kind;
  }
  if (kind !== 'files') {
    return undefined;
  }
  if (TEST_SOURCES.has(target)) {
    return action === INCLUDE ? TEST_SOURCE : 'test';
  }
  return 'source';
}

export function taskFilter({ path: headers, text }: GradleStatement): TaskFilter | undefined {
  const target = targetOfHeaders(headers);
  const resolved = target === undefined ? withReceiver(text) : { target, text };
  if (resolved === undefined) {
    return undefined;
  }
  const group = GROUPS[resolved.target] ?? '';
  const statement = resolved.text.replace(WITHOUT_RECEIVER, '');
  if (resolved.target === 'test' && (DISABLED.test(statement) || onlyIfFalse(headers, statement))) {
    return { action: EXCLUDE, kind: 'tag', group, disabled: true };
  }
  const filter = FILTERS.find(({ pattern }) => pattern.test(statement));
  if (filter === undefined) {
    return undefined;
  }
  const kind = kindFor(resolved.target, filter);
  return kind === undefined ? undefined : { action: filter.action, kind, group, text: statement };
}
