import { simpleCase, type Shape } from './simple-case.mts';

const CHECK = 'UseEnumCollections';
const COLOR: Shape = ['enum Color {\n  RED,\n  GREEN\n}'];

export const ENUM_CASES = [
  simpleCase({
    check: CHECK,
    name: 'EnumLocalSet',
    imports: ['java.util.HashSet', 'java.util.Set'],
    importsAfter: ['java.util.EnumSet', 'java.util.Set'],
    members: [COLOR],
    statements: [
      ['Set<Color> seen = new HashSet<>();', 'Set<Color> seen = EnumSet.noneOf(Color.class);'],
    ],
  }),
  simpleCase({
    check: CHECK,
    name: 'EnumFieldMap',
    imports: ['java.util.HashMap', 'java.util.List', 'java.util.Map'],
    importsAfter: ['java.util.EnumMap', 'java.util.List', 'java.util.Map'],
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
    imports: [
      'java.util.Collection',
      'java.util.HashMap',
      'java.util.HashSet',
      'java.util.Map',
      'java.util.Set',
    ],
    importsAfter: [
      'java.util.Collection',
      'java.util.EnumMap',
      'java.util.EnumSet',
      'java.util.HashSet',
      'java.util.Map',
      'java.util.Set',
    ],
    members: [
      COLOR,
      ['static void accept(Set<Color> colors) {}', undefined],
      ['static void acceptAll(Collection<Color> colors) {}', undefined],
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
      'java.util.Collection',
      'java.util.EnumSet',
      'java.util.HashMap',
      'java.util.HashSet',
      'java.util.LinkedHashSet',
      'java.util.List',
      'java.util.Map',
      'java.util.Set',
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
    imports: ['java.util.HashSet', 'java.util.Set'],
    parameters: 'Class<T> type',
    statements: [['Set<T> bound = new HashSet<>();']],
  }),
];
