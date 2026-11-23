package n;

import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

class Functional {
  interface Taker<T> {
    void take(@Nullable T value);
  }

  interface Maker<T> {
    T make();
  }

  interface NullMaker<T> {
    @Nullable T make();
  }

  interface Both<A, B> {
    B apply(@Nullable A first, A second);
  }

  interface Pair<A, B> {
    void pair(A first, @Nullable B second);
  }

  interface Fn<A, B> {
    B apply(A value);
  }

  interface Count<T> {
    int count(T value);
  }

  Functional() {}

  Functional(String text) {}

  static void needs(String text) {}

  static void accepts(@Nullable String text) {}

  static void needsList(List<String> texts) {}

  static void needsArray(String[] texts) {}

  static void many(String... texts) {}

  static void two(String first, String second) {}

  static void twoAccepting(String first, @Nullable String second) {}

  static @Nullable String maybe() {
    return null;
  }

  static String sure() {
    return "";
  }

  static @Nullable Integer size(String text) {
    return null;
  }

  @Contract("!null -> !null")
  static @Nullable String same(@Nullable String text) {
    return text;
  }

  @Contract("null -> null")
  static @Nullable String other(@Nullable String text) {
    return text;
  }

  String instance() {
    return "";
  }

  @Nullable String instanceMaybe() {
    return null;
  }

  static <T> void taker(Taker<T> taker, T value) {}

  static <T> T maker(Maker<T> maker) {
    return maker.make();
  }

  void lambdas() {
    Taker<String> a = (String text) -> {};
    Taker<String> b = (@Nullable String text) -> {};
    Taker<String> c = text -> {};
    Taker<String> d = (var text) -> {};
    Both<String, String> e = (String first, String second) -> second;
    Both<String, String> f = (@Nullable String first, String second) -> second;
    Pair<String, String> g = (String first, String second) -> {};
    Pair<String, String> h = (first, second) -> {};
    Fn<String, String> i = (String text) -> text;
    taker((String text) -> {}, "");
  }

  void references(List<String> texts) {
    Taker<String> a = Functional::needs;
    Taker<String> b = Functional::accepts;
    Maker<String> c = Functional::maybe;
    NullMaker<String> d = Functional::maybe;
    Maker<String> e = Functional::sure;
    Taker<Functional> f = Functional::instance;
    Taker<String> g = Functional::new;
    Maker<Functional> h = Functional::new;
    Maker<String> i = this::instanceMaybe;
    Maker<String> j = this::instance;
    Taker<List<String>> k = Functional::needsList;
    Taker<String[]> l = Functional::needsArray;
    Taker<String> m = Functional::many;
    Pair<String, String> n = Functional::two;
    Pair<String, String> o = Functional::twoAccepting;
    Fn<String, String> p = Functional::same;
    Fn<String, String> q = Functional::other;
    Fn<Functional, String> r = Functional::instanceMaybe;
    Count<String> s = Functional::size;
    taker(Functional::needs, "");
    String made = maker(Functional::maybe);
    Function<String, Integer> t = Functional::size;
    List<Integer> sizes = texts.stream().map(Functional::size).collect(Collectors.toList());
  }

  static class Box<K> {
    void keep(K key) {}

    void fill() {
      Taker<K> a = this::keep;
      Taker<List<K>> b = Functional::needsAny;
      Pair<K, List<K>> c = Box::both;
      Pair<K, List<? extends K>> d = Box::bothExtends;
      Pair<K, List<? super K>> e = Box::bothSuper;
    }

    static <T> void both(T first, List<T> second) {}

    static <T> void bothExtends(T first, List<? extends T> second) {}

    static <T> void bothSuper(T first, List<? super T> second) {}
  }

  static <T> void needsAny(List<T> values) {}
}
