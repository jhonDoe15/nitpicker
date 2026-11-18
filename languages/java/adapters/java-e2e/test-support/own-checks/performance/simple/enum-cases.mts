import { simpleCase, type Shape } from './simple-case.mts';

const UTIL_MAP = 'java.util.Map';
const UTIL_SET = 'java.util.Set';
const UTIL_COLLECTION = 'java.util.Collection';
const UTIL_ENUM_SET = 'java.util.EnumSet';
const UTIL_HASH_MAP = 'java.util.HashMap';
const UTIL_HASH_SET = 'java.util.HashSet';
const UTIL_LIST = 'java.util.List';

const CHECK = 'UseEnumCollections';
const COLOR: Shape = ['enum Color {\n  RED,\n  GREEN\n}'];

export const ENUM_CASES = [
  simpleCase({
    check: CHECK,
    name: 'EnumLocalSet',
    imports: [UTIL_HASH_SET, UTIL_SET],
    importsAfter: [UTIL_ENUM_SET, UTIL_SET],
    members: [COLOR],
    statements: [
      ['Set<Color> seen = new HashSet<>();', 'Set<Color> seen = EnumSet.noneOf(Color.class);'],
    ],
  }),
  simpleCase({
    check: CHECK,
    name: 'EnumFieldMap',
    imports: [UTIL_HASH_MAP, UTIL_LIST, UTIL_MAP],
    importsAfter: ['java.util.EnumMap', UTIL_LIST, UTIL_MAP],
    members: [
      COLOR,
      [
        'final Map<Color, List<String>> names = new HashMap<>();',
        'final Map<Color, List<String>> names = new EnumMap<>(Color.class);',
      ],
    ],
  }),
  simpleCase({
    check: CHECK,
    name: 'EnumInline',
    imports: [UTIL_COLLECTION, UTIL_HASH_MAP, UTIL_HASH_SET, UTIL_MAP, UTIL_SET],
    importsAfter: [UTIL_COLLECTION, 'java.util.EnumMap', UTIL_ENUM_SET, UTIL_MAP, UTIL_SET],
    members: [
      COLOR,
      ['static void accept(Set<Color> colors) {}'],
      ['static void acceptAll(Collection<Color> colors) {}'],
      [
        'Set<Color> fresh() {\n  return new HashSet<>();\n}',
        'Set<Color> fresh() {\n  return EnumSet.noneOf(Color.class);\n}',
      ],
      [
        'Map<Color, Integer> counts() {\n  return new HashMap<Color, Integer>();\n}',
        'Map<Color, Integer> counts() {\n  return new EnumMap<Color, Integer>(Color.class);\n}',
      ],
    ],
    statements: [
      ['accept(new HashSet<>());', 'accept(EnumSet.noneOf(Color.class));'],
      [
        'Collection<Color> all = new HashSet<Color>();',
        'Collection<Color> all = EnumSet.noneOf(Color.class);',
      ],
    ],
  }),
  simpleCase({
    check: CHECK,
    name: 'EnumDeclined',
    imports: [
      UTIL_COLLECTION,
      UTIL_ENUM_SET,
      UTIL_HASH_MAP,
      UTIL_HASH_SET,
      'java.util.LinkedHashSet',
      UTIL_LIST,
      UTIL_MAP,
      UTIL_SET,
    ],
    members: [
      COLOR,
      ['static void takeHash(HashSet<Color> colors) {}'],
      ['static void over(Set<Color> colors) {}'],
      ['static void over(EnumSet<Color> colors) {}'],
      ['private final HashSet<Color> declaredSet = new HashSet<>();'],
      ['private final HashMap<Color, String> declaredMap = new HashMap<>();'],
    ],
    parameters: 'Collection<Color> source, Map<Color, String> names, List<Class<?>> kinds',
    statements: [
      ['Set<Color> copy = new HashSet<>(source);'],
      ['Set<Color> sized = new HashSet<>(16);'],
      ['Map<Color, String> copied = new HashMap<>(names);'],
      ['Map<Color, String> capacity = new HashMap<>(8);'],
      ['var inferred = new HashSet<Color>();'],
      ['takeHash(new HashSet<>());'],
      ['over(new HashSet<>());'],
      ['Set<String> words = new HashSet<>();'],
      ['Set<Enum<?>> wild = new HashSet<>();'],
      ['Set rawSet = new HashSet();'],
      ['Set<Color> anonymous = new HashSet<>() {};'],
      ['Set<Color> ordered = new LinkedHashSet<>();'],
      ['Object untyped = new HashSet<Color>();'],
      ['new HashSet<Color>().add(Color.RED);'],
    ],
  }),
  simpleCase({
    check: CHECK,
    name: 'EnumTypeVariable',
    typeParameters: '<T extends Enum<T>>',
    imports: [UTIL_HASH_SET, UTIL_SET],
    parameters: 'Class<T> type',
    statements: [['Set<T> bound = new HashSet<>();']],
  }),
];
