const TASKS = String.raw`(?:(?:project\.)?tasks\.)?`;
function typeArgument(types) {
  return String.raw`(?:${types})(?:::class(?:\.java)?)?`;
}

function named(names) {
  return String.raw`(?:named|getByName)\s*(?:<\s*\w+\s*>\s*)?\(\s*["'](?:${names})["']\s*(?:,\s*\w+(?:::class(?:\.java)?)?\s*)?\)`;
}

function withType(types) {
  return String.raw`withType\s*(?:\(\s*${typeArgument(types)}\s*\)|<\s*(?:${types})\s*>(?:\s*\(\s*\))?)`;
}
const CONFIGURED = String.raw`(?:\.get\(\))?(?:\.(?:configure|configureEach|all)(?:\s*\(\s*\))?)?`;

function taskPattern(names, types) {
  const typed = types === undefined ? '' : `|${withType(types)}`;
  return String.raw`${TASKS}(?:${names}|${named(names)}${typed})${CONFIGURED}`;
}

const TARGETS = [
  { target: 'test', pattern: taskPattern('test', 'Test') },
  {
    target: 'compile',
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
    action: 'exclude',
    kind: 'files',
    pattern: /^(?:exclude|setExcludes)\b(?!\s*(?:\(\s*)?(?:group|module)\s*[:=])/u,
  },
  { action: 'exclude', kind: 'files', pattern: /^excludes\s*\+?=/u },
  { action: 'exclude', kind: 'name', pattern: /^excludeTestsMatching\b/u },
  {
    action: 'exclude',
    kind: 'tag',
    pattern: /^(?:excludeTags|excludeEngines|excludeCategories)\b/u,
  },
  { action: 'include', kind: 'files', pattern: /^(?:include|setIncludes)\b/u },
  { action: 'include', kind: 'files', pattern: /^includes\s*\+?=/u },
  { action: 'include', kind: 'name', pattern: /^includeTestsMatching\b/u },
  {
    action: 'include',
    kind: 'tag',
    pattern: /^(?:includeTags|includeEngines|includeCategories)\b/u,
  },
];
const WITHOUT_RECEIVER =
  /^(?:filter|options|useJUnitPlatform|useJUnit|useTestNG)\s*(?:\(\s*\))?\./u;

function taskTarget(headers) {
  for (const [index, text] of headers.entries()) {
    const found = TARGETS.find(({ header, receiver }) => header.test(text) || receiver.test(text));
    if (found !== undefined) {
      const nested = headers.slice(index + 1);
      return nested.every((inner) => FILTER_BLOCKS.test(inner)) ? found.target : undefined;
    }
  }
  return undefined;
}

function targetOfHeaders(headers) {
  const inSourceSets = headers.some((text) => SOURCE_SETS.test(text));
  if (!inSourceSets) {
    return taskTarget(headers);
  }
  if (headers.some((text) => RESOURCES.test(text))) {
    return undefined;
  }
  return headers.some((text) => TEST_SET.test(text)) ? 'testSource' : 'source';
}

function withReceiver(text) {
  for (const { target, receiver } of TARGETS) {
    const rest = receiver.exec(text)?.[1];
    if (rest !== undefined) {
      return { target, text: rest };
    }
  }
  return undefined;
}

function onlyIfFalse(headers, text) {
  return text === 'false' && ONLY_IF.test(headers.at(-1) ?? '');
}

const GROUPS = {
  test: 'test',
  compile: 'compile',
  compileTest: 'compile',
  source: 'source set',
  testSource: 'source set',
};
const TEST_SOURCES = new Set(['compileTest', 'testSource']);

function kindFor(target, { action, kind }) {
  if (target === 'test') {
    return kind === 'files' ? 'test' : kind;
  }
  if (kind !== 'files') {
    return undefined;
  }
  if (TEST_SOURCES.has(target)) {
    return action === 'include' ? 'testSource' : 'test';
  }
  return 'source';
}

export function taskFilter({ path: headers, text }) {
  const target = targetOfHeaders(headers);
  const resolved = target === undefined ? withReceiver(text) : { target, text };
  if (resolved === undefined) {
    return undefined;
  }
  const group = GROUPS[resolved.target];
  const statement = resolved.text.replace(WITHOUT_RECEIVER, '');
  if (resolved.target === 'test' && (DISABLED.test(statement) || onlyIfFalse(headers, statement))) {
    return { action: 'exclude', kind: 'tag', group, disabled: true };
  }
  const filter = FILTERS.find(({ pattern }) => pattern.test(statement));
  const kind = filter === undefined ? undefined : kindFor(resolved.target, filter);
  return kind === undefined ? undefined : { action: filter.action, kind, group, text: statement };
}
