import { simpleCase, type Shape } from './simple-case.mts';

const UTIL_COMPARATOR = 'java.util.Comparator';
const UTIL_LIST = 'java.util.List';
const UTIL_OPTIONAL = 'java.util.Optional';
const UTIL_COLLECTORS = 'java.util.stream.Collectors';

const CHECK = 'SortForExtreme';
const PERSON: Shape = ['record Person(String name, int age) {}'];
const BY_AGE = 'Comparator.comparingInt(Person::age)';

export const SORT_CASES = [
  simpleCase({
    check: CHECK,
    name: 'SortFirstOptional',
    imports: [UTIL_COMPARATOR, UTIL_LIST, UTIL_OPTIONAL],
    members: [PERSON],
    parameters: 'List<Person> people, List<String> names',
    statements: [
      [
        `Optional<Person> youngest = people.stream().sorted(${BY_AGE}).findFirst();`,
        `Optional<Person> youngest = people.stream().min(${BY_AGE});`,
      ],
      [
        'Optional<String> first = names.stream().sorted().findFirst();',
        'Optional<String> first = names.stream().min(Comparator.naturalOrder());',
      ],
      [
        `Person oldest = people.stream()\n  .sorted(${BY_AGE}.reversed())\n  .findFirst()\n  .orElse(null);`,
        `Person oldest = people.stream()\n  .min(${BY_AGE}.reversed())\n  .orElse(null);`,
      ],
    ],
  }),
  simpleCase({
    check: CHECK,
    name: 'SortFirstOfList',
    imports: [UTIL_COMPARATOR, UTIL_LIST, UTIL_COLLECTORS, 'java.util.stream.Stream'],
    importsAfter: [UTIL_COMPARATOR, UTIL_LIST, 'java.util.stream.Stream'],
    members: [PERSON],
    parameters: 'List<Person> people, Stream<String> words',
    statements: [
      [
        `Person a = people.stream().sorted(${BY_AGE}).toList().get(0);`,
        `Person a = people.stream().min(${BY_AGE}).orElseThrow();`,
      ],
      [
        `Person b = people.stream().sorted(${BY_AGE}).collect(Collectors.toList()).get(0);`,
        `Person b = people.stream().min(${BY_AGE}).orElseThrow();`,
      ],
      [
        `Person c = people.stream().sorted(${BY_AGE}).toList().getFirst();`,
        `Person c = people.stream().min(${BY_AGE}).orElseThrow();`,
      ],
      [
        `Person d = people.stream().sorted(${BY_AGE}).collect(Collectors.toUnmodifiableList()).getFirst();`,
        `Person d = people.stream().min(${BY_AGE}).orElseThrow();`,
      ],
      [
        'String e = words.sorted().toList().get(0);',
        'String e = words.min(Comparator.naturalOrder()).orElseThrow();',
      ],
    ],
  }),
  simpleCase({
    check: CHECK,
    name: 'SortFirstInherited',
    imports: [UTIL_LIST, UTIL_OPTIONAL],
    importsAfter: [UTIL_COMPARATOR, UTIL_LIST, UTIL_OPTIONAL],
    members: [
      [
        'static class Base implements Comparable<Base> {\n  @Override public int compareTo(Base other) {\n    return 0;\n  }\n}',
      ],
      ['static class Derived extends Base {}'],
      [
        'static <T extends Comparable<T>> Optional<T> least(List<T> items) {\n  return items.stream().sorted().findFirst();\n}',
        'static <T extends Comparable<T>> Optional<T> least(List<T> items) {\n  return items.stream().min(Comparator.naturalOrder());\n}',
      ],
    ],
    parameters: 'List<Derived> derived',
    statements: [
      [
        'Optional<Derived> first = derived.stream().sorted().findFirst();',
        'Optional<Derived> first = derived.stream().min(Comparator.naturalOrder());',
      ],
    ],
  }),
  simpleCase({
    check: CHECK,
    name: 'SortKeepsCollectors',
    imports: [UTIL_COMPARATOR, UTIL_LIST, UTIL_OPTIONAL, UTIL_COLLECTORS],
    parameters: 'List<String> names',
    statements: [
      [
        'String a = names.stream().sorted(Comparator.comparing(s -> List.of(s, s).stream().collect(Collectors.joining()))).collect(Collectors.toList()).get(0);',
        'String a = names.stream().min(Comparator.comparing(s -> List.of(s, s).stream().collect(Collectors.joining()))).orElseThrow();',
      ],
      [
        'Optional<String> b = names.stream().sorted(Comparator.comparing(s -> List.of(s, s).stream().collect(Collectors.joining()))).findFirst();',
        'Optional<String> b = names.stream().min(Comparator.comparing(s -> List.of(s, s).stream().collect(Collectors.joining())));',
      ],
    ],
  }),
  simpleCase({
    check: CHECK,
    name: 'SortKept',
    imports: [
      UTIL_COMPARATOR,
      'java.util.LinkedHashSet',
      UTIL_LIST,
      UTIL_OPTIONAL,
      UTIL_COLLECTORS,
      'java.util.stream.IntStream',
    ],
    members: [
      PERSON,
      ['static class Plain {}'],
      [
        'static class Base implements Comparable<Base> {\n  @Override public int compareTo(Base other) {\n    return 0;\n  }\n}',
      ],
    ],
    parameters: 'List<Person> people, List<Plain> plains, List<? extends Base> wild',
    statements: [
      [`Person last = people.stream().sorted(${BY_AGE}).toList().getLast();`],
      [`Person second = people.stream().sorted(${BY_AGE}).toList().get(1);`],
      [
        `Person indexed = people.stream().sorted(${BY_AGE}).collect(Collectors.toList()).get(people.size());`,
      ],
      ['Optional<Plain> unordered = plains.stream().sorted().findFirst();'],
      ['Optional<? extends Base> captured = wild.stream().sorted().findFirst();'],
      ['var ints = IntStream.of(3, 1).sorted().findFirst();'],
      [
        `Optional<Person> filtered = people.stream().sorted(${BY_AGE}).filter(p -> p.age() > 1).findFirst();`,
      ],
      [`List<Person> kept = people.stream().sorted(${BY_AGE}).toList();`],
      [
        `Person grouped = people.stream().sorted(${BY_AGE}).collect(Collectors.toCollection(LinkedHashSet::new)).iterator().next();`,
      ],
    ],
  }),
];
