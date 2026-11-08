import { describe, expect, it } from 'vitest';
import { blankLiterals } from '../adapters/review-rules/java-sources.mjs';
import { javaOutline, placeAt } from './java-members.mjs';

const SOURCE = `package shop;

import java.util.*;

@Service(value = "shop")
public final class Shop<T extends Comparable<T>> {
  private static final Map<String, Integer> COUNTS = new HashMap<>() {{
    put("a", Files.size(Path.of("a")));
  }};
  static final Runnable LATER = () -> { Files.delete(Path.of("later")); };
  static final Shop<String> INSTANCE = new Shop<>("x");
  private final boolean ready = Files.exists(Path.of("ready"));
  private int count;

  static {
    Files.createDirectories(Path.of("logs"));
  }

  {
    count = Files.list(Path.of("."));
  }

  @Inject
  Shop(String name) {
    this.count = load(name);
  }

  private static int load(String name) {
    return Files.readAllLines(Path.of(name)).size();
  }

  enum Mode {
    FAST(1) {
      final boolean on = Files.exists(Path.of("fast"));
    },
    SLOW(2);

    Mode(int speed) {}
  }

  record Point(int x, int y) {
    Point {
      Files.exists(Path.of("point"));
    }
  }

  interface Api {
    boolean UP = Files.exists(Path.of("up"));
  }
}
`;
const TEXT = blankLiterals(SOURCE);
const TYPES = javaOutline(TEXT);

function placeOf(snippet) {
  const place = placeAt(TYPES, SOURCE.indexOf(snippet));
  const { kind, name, isStatic } = place.member;
  return [place.type.name, kind, name, isStatic].join(' ');
}

describe('javaOutline and placeAt', () => {
  it.each([
    ['Files.size(Path.of("a"))', 'Shop field COUNTS true'],
    ['Files.delete(Path.of("later"))', 'Shop field LATER true'],
    ['new Shop<>("x")', 'Shop field INSTANCE true'],
    ['Files.exists(Path.of("ready"))', 'Shop field ready false'],
    ['Files.createDirectories', 'Shop static-block  true'],
    ['Files.list', 'Shop initializer  false'],
    ['load(name);', 'Shop constructor Shop false'],
    ['Files.readAllLines', 'Shop method load true'],
    ['Files.exists(Path.of("fast"))', 'Mode constant FAST true'],
    ['Files.exists(Path.of("point"))', 'Point constructor Point false'],
    ['Files.exists(Path.of("up"))', 'Api field UP true'],
  ])('places %s in its member', (snippet, expected) => {
    expect(placeOf(snippet)).toBe(expected);
  });

  it('lists the members of each type in source order', () => {
    const shop = TYPES.find(({ name }) => name === 'Shop');

    expect(shop.members.map(({ kind, name }) => `${kind} ${name ?? ''}`.trim())).toEqual([
      'field COUNTS',
      'field LATER',
      'field INSTANCE',
      'field ready',
      'field count',
      'static-block',
      'initializer',
      'constructor Shop',
      'method load',
      'type Mode',
      'type Point',
      'type Api',
    ]);
    expect(TYPES.find(({ name }) => name === 'Mode').members.map(({ name }) => name)).toEqual([
      'FAST',
      'SLOW',
      'Mode',
    ]);
  });

  it('finds no place outside every type', () => {
    expect(placeAt(TYPES, SOURCE.indexOf('import'))).toBeUndefined();
  });
});
