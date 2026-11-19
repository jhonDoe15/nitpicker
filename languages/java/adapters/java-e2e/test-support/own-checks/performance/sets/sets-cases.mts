const MAIN = 'src/main/java/demo';
const CHECK = 'ListUsedAsSet';
const ARRAY_LIST = 'ArrayList';
const LINKED_HASH_SET = 'LinkedHashSet';
const RUN_NAMES = 'run(List<String> names)';
const FOR_NAME = 'for (String name : names) {';
const FOR_EACH = 'for (String each : seen) {';
const PRINT_EACH = '  System.out.println(each);';
const ADD_NAME = '    seen.add(name);';
const PRINT_NAME = '    System.out.println(name);';
const GUARD_NEW = '  if (!seen.contains(name)) {';
const GUARD_SEEN = '  if (seen.contains(name)) {';
const GUARD_FIRST = '  if (!first.contains(name)) {';
const ADD_FIRST = '    first.add(name);';
const ADD_KNOWN = 'known.add("a");';
const SECOND_LIST = 'List<String> second = new ArrayList<>();';

type Shape = {
  readonly name: string;
  readonly imports: readonly string[];
  readonly members?: string;
  readonly before: readonly string[];
  readonly after: readonly string[];
  readonly gone?: readonly string[];
  readonly added?: readonly string[];
};

function importBlock(names: readonly string[]): string {
  return `${names
    .toSorted()
    .map((name) => `import java.util.${name};`)
    .join('\n')}\n`;
}

function headOf(name: string, imports: readonly string[], members: string): string {
  return `package demo;\n\n${importBlock(imports)}\npublic class ${name} {\n${members}`;
}

function build({ name, imports, members = '', before, after, gone = [], added = [] }: Shape) {
  const afterImports = [...imports.filter((entry) => !gone.includes(entry)), ...added];
  const first = before.findIndex((line, index) => line !== after[index]);
  const signature = before.findIndex((line) => line.startsWith('  ') && line.endsWith(') {'));
  return {
    check: CHECK,
    file: `${MAIN}/${name}.java`,
    before: `${headOf(name, imports, members)}${before.join('\n')}\n}\n`,
    after: `${headOf(name, afterImports, members)}${after.join('\n')}\n}\n`,
    lines: first < 0 ? [] : [headOf(name, imports, members).split('\n').length + signature],
  };
}

const REWRITE = { gone: [ARRAY_LIST], added: [LINKED_HASH_SET, 'Set'] };

function method(signature: string, ...lines: readonly string[]): readonly string[] {
  const typed = /^[A-Z]/u.test(signature) ? signature : `void ${signature}`;
  return [`  ${typed} {`, ...lines.map((line) => `    ${line}`), '  }'];
}

const GUARDED = {
  name: 'SetGuarded',
  imports: [ARRAY_LIST, 'List'],
  before: method(
    RUN_NAMES,
    'List<String> seen = new ArrayList<>();',
    FOR_NAME,
    GUARD_NEW,
    ADD_NAME,
    PRINT_NAME,
    '  }',
    '}',
    'System.out.println(seen.isEmpty());',
  ),
  after: method(
    RUN_NAMES,
    'Set<String> seen = new LinkedHashSet<>();',
    FOR_NAME,
    GUARD_NEW,
    ADD_NAME,
    PRINT_NAME,
    '  }',
    '}',
    'System.out.println(seen.isEmpty());',
  ),
  ...REWRITE,
};

const ITERATED = {
  name: 'SetIterated',
  imports: [ARRAY_LIST, 'List'],
  before: method(
    RUN_NAMES,
    'ArrayList<String> seen = new ArrayList<String>();',
    FOR_NAME,
    '  if (name.length() > 1 && !seen.contains(name)) {',
    ADD_NAME,
    '  }',
    '}',
    FOR_EACH,
    PRINT_EACH,
    '}',
    'System.out.println(seen.stream().count());',
  ),
  after: method(
    RUN_NAMES,
    'Set<String> seen = new LinkedHashSet<String>();',
    FOR_NAME,
    '  if (name.length() > 1 && !seen.contains(name)) {',
    ADD_NAME,
    '  }',
    '}',
    FOR_EACH,
    PRINT_EACH,
    '}',
    'System.out.println(seen.stream().count());',
  ),
  ...REWRITE,
};

const EARLY_EXIT = {
  name: 'SetEarlyExit',
  imports: ['LinkedList', 'List'],
  members: '  record Point(int x, int y) {}\n\n',
  before: method(
    'run(List<Point> points)',
    'var seen = new LinkedList<Point>();',
    'for (Point point : points) {',
    '  if (seen.contains(point)) {',
    '    continue;',
    '  }',
    '  seen.add(point);',
    '  seen.remove(point);',
    '}',
  ),
  after: method(
    'run(List<Point> points)',
    'var seen = new LinkedHashSet<Point>();',
    'for (Point point : points) {',
    '  if (seen.contains(point)) {',
    '    continue;',
    '  }',
    '  seen.add(point);',
    '  seen.remove(point);',
    '}',
  ),
  gone: ['LinkedList'],
  added: [LINKED_HASH_SET],
};

const ELSE_GUARD = {
  name: 'SetElseGuard',
  imports: [ARRAY_LIST, 'List'],
  before: method(
    RUN_NAMES,
    'List<String> seen = new ArrayList<>();',
    'names.forEach(name -> {',
    GUARD_SEEN,
    PRINT_NAME,
    '  } else {',
    ADD_NAME,
    '  }',
    '});',
    FOR_EACH,
    PRINT_EACH,
    '}',
  ),
  after: method(
    RUN_NAMES,
    'Set<String> seen = new LinkedHashSet<>();',
    'names.forEach(name -> {',
    GUARD_SEEN,
    PRINT_NAME,
    '  } else {',
    ADD_NAME,
    '  }',
    '});',
    FOR_EACH,
    PRINT_EACH,
    '}',
  ),
  ...REWRITE,
};

const LOOKUPS = {
  name: 'SetLookups',
  imports: [ARRAY_LIST, 'List'],
  before: method(
    RUN_NAMES,
    'List<String> known = new ArrayList<>(16);',
    ADD_KNOWN,
    ADD_KNOWN,
    FOR_NAME,
    '  if (known.contains(name)) {',
    PRINT_NAME,
    '  }',
    '}',
  ),
  after: method(
    RUN_NAMES,
    'Set<String> known = new LinkedHashSet<>(16);',
    ADD_KNOWN,
    ADD_KNOWN,
    FOR_NAME,
    '  if (known.contains(name)) {',
    PRINT_NAME,
    '  }',
    '}',
  ),
  ...REWRITE,
};

const TWO_LISTS = {
  name: 'SetTwoLists',
  imports: [ARRAY_LIST, 'List'],
  before: method(
    RUN_NAMES,
    'List<String> first = new ArrayList<>();',
    SECOND_LIST,
    FOR_NAME,
    GUARD_FIRST,
    ADD_FIRST,
    '  }',
    '  second.add(name);',
    '}',
    'System.out.println(second.size());',
  ),
  after: method(
    RUN_NAMES,
    'Set<String> first = new LinkedHashSet<>();',
    SECOND_LIST,
    FOR_NAME,
    GUARD_FIRST,
    ADD_FIRST,
    '  }',
    '  second.add(name);',
    '}',
    'System.out.println(second.size());',
  ),
  gone: [],
  added: [LINKED_HASH_SET, 'Set'],
};

const BOTH_LISTS = {
  name: 'SetBothLists',
  imports: [ARRAY_LIST, 'List'],
  before: method(
    RUN_NAMES,
    'List<String> first = new ArrayList<>();',
    SECOND_LIST,
    FOR_NAME,
    GUARD_FIRST,
    ADD_FIRST,
    '  }',
    '  if (!second.contains(name)) {',
    '    second.add(name);',
    '  }',
    '}',
  ),
  after: method(
    RUN_NAMES,
    'Set<String> first = new LinkedHashSet<>();',
    'Set<String> second = new LinkedHashSet<>();',
    FOR_NAME,
    GUARD_FIRST,
    ADD_FIRST,
    '  }',
    '  if (!second.contains(name)) {',
    '    second.add(name);',
    '  }',
    '}',
  ),
  ...REWRITE,
};

function declined(name: string, members: string, methods: readonly (readonly string[])[]): Shape {
  const body = methods.flatMap((lines) => ['', ...lines]).slice(1);
  return { name, imports: [ARRAY_LIST, 'Collection', 'List'], members, before: body, after: body };
}

const SEARCH = [FOR_NAME, GUARD_NEW, ADD_NAME, '  }', '}'];

function searched(
  signature: string,
  declaration: string,
  ...rest: readonly string[]
): readonly string[] {
  return method(signature, declaration, ...SEARCH, ...rest);
}

const LIST = 'List<String> seen = new ArrayList<>();';
const LOOSE =
  '  static class Loose {\n    String name;\n\n    @Override\n    public boolean equals(Object other) {\n      return other instanceof Loose that && that.name.equals(name);\n    }\n  }\n\n';

const ESCAPES = declined('SetEscapes', '', [
  method('List<String> returned(List<String> names)', LIST, ...SEARCH, 'return seen;'),
  searched('printed(List<String> names)', LIST, 'System.out.println(seen);'),
  searched('sized(List<String> names)', LIST, 'System.out.println(seen.size());'),
  searched('indexed(List<String> names)', LIST, 'System.out.println(seen.get(0));'),
  searched('sorted(List<String> names)', LIST, 'seen.sort(null);'),
  searched('array(List<String> names)', LIST, 'seen.toArray();'),
  searched('reassigned(List<String> names)', LIST, 'seen = new ArrayList<>();'),
  searched('copied(List<String> names)', LIST, 'List<String> other = seen;'),
  searched(
    'inLambda(List<String> names)',
    LIST,
    'names.forEach(name -> System.out.println(seen.isEmpty()));',
  ),
  method(
    'removed(List<Integer> numbers)',
    'List<Integer> seen = new ArrayList<>();',
    'for (Integer number : numbers) {',
    '  if (!seen.contains(number)) {',
    '    seen.add(number);',
    '  }',
    '}',
    'seen.remove(0);',
  ),
]);

const SOURCES = declined('SetSources', '', [
  method(
    'collection(Collection<String> names)',
    'List<String> seen = new ArrayList<>(names);',
    ...SEARCH,
  ),
  searched('literal(List<String> names)', 'List<String> seen = List.of("a");'),
  searched('addAll(List<String> names)', LIST, 'seen.addAll(names);'),
  searched('typed(Collection<String> names)', 'Collection<String> seen = new ArrayList<>();'),
  method(
    'anonymous(List<String> names)',
    LIST,
    'Runnable run = new Runnable() {',
    '  @Override',
    '  public void run() {',
    '    seen.contains("a");',
    '  }',
    '};',
    ...SEARCH,
  ),
  method('subclass(List<String> names)', 'List<String> seen = new ArrayList<>() {};', ...SEARCH),
]);

const DUPLICATES = declined('SetDuplicates', LOOSE, [
  method(
    'unguarded(List<String> names)',
    LIST,
    FOR_NAME,
    GUARD_SEEN,
    PRINT_NAME,
    '  }',
    '  seen.add(name);',
    '}',
    FOR_EACH,
    PRINT_EACH,
    '}',
  ),
  method(
    'removed(List<String> names)',
    LIST,
    FOR_NAME,
    GUARD_SEEN,
    '    seen.remove(name);',
    '  }',
    '  seen.add(name);',
    '}',
  ),
  method(
    'otherValue(List<String> names)',
    LIST,
    FOR_NAME,
    GUARD_NEW,
    '    seen.add(name.trim());',
    '  }',
    '}',
    FOR_EACH,
    PRINT_EACH,
    '}',
  ),
  method(
    'lateAdd(List<String> names)',
    LIST,
    FOR_NAME,
    GUARD_NEW,
    PRINT_NAME,
    ADD_NAME,
    '  }',
    '}',
    FOR_EACH,
    PRINT_EACH,
    '}',
  ),
  method(
    'looseEquality(List<Loose> items)',
    'List<Loose> seen = new ArrayList<>();',
    'for (Loose item : items) {',
    '  if (!seen.contains(item)) {',
    '    seen.add(item);',
    '  }',
    '}',
  ),
]);

export const SET_CASES = [
  GUARDED,
  ITERATED,
  EARLY_EXIT,
  ELSE_GUARD,
  LOOKUPS,
  TWO_LISTS,
  BOTH_LISTS,
  ESCAPES,
  SOURCES,
  DUPLICATES,
].map(build);
