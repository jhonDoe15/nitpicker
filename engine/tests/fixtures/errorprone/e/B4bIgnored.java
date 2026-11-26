package e;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class B4bIgnored {
  enum Color { RED }

  static class Own {
    int size() { return 1; }
    @Override public String toString() { return "own"; }
    void run() {
      toString();
      hashCode();
      getClass();
      this.toString();
      size();
    }
  }

  void strings(String s, CharSequence cs, StringBuilder sb) {
    s.trim();
    s.length();
    s.substring(1);
    String.valueOf(1);
    String.format("x");
    cs.length();
    sb.length();
    sb.append("x");
    s.equals("a");
    s.hashCode();
    s.isEmpty();
  }

  void collections(List<String> list, Map<String, String> map, Collection<String> c, Iterator<String> it) {
    list.size();
    list.isEmpty();
    list.contains("a");
    list.containsAll(c);
    list.stream();
    list.toArray();
    list.toArray(new String[0]);
    list.toArray(String[]::new);
    list.get(0);
    list.add("a");
    list.indexOf("a");
    list.iterator();
    list.spliterator();
    map.get("a");
    map.size();
    map.containsKey("a");
    map.containsValue("a");
    map.keySet();
    map.values();
    map.entrySet();
    map.isEmpty();
    map.put("a", "b");
    Map.of();
    Map.entry("a", "b");
    Map.copyOf(map);
    it.hasNext();
    it.next();
    for (Map.Entry<String, String> e : map.entrySet()) {
      e.getKey();
      e.getValue();
      e.hashCode();
    }
    Map.Entry.comparingByKey();
    new ArrayList<String>().size();
    new HashMap<String, String>().keySet();
  }

  void arraysAndObjects(int[] a, Object o) {
    Arrays.asList(1);
    Arrays.sort(a);
    Arrays.copyOf(a, 2);
    Arrays.toString(a);
    Objects.hash(1);
    Objects.requireNonNull(o);
    Objects.requireNonNullElse(o, o);
    Objects.equals(o, o);
    Objects.toString(o);
    o.toString();
    o.hashCode();
    o.getClass();
    o.equals(o);
    a.clone();
    a.getClass();
  }

  void boxes(Integer i, Long l, Boolean b, Character ch, Double d) {
    Integer.parseInt("1");
    Integer.valueOf("1");
    Integer.valueOf("1", 2);
    Integer.valueOf(1);
    Integer.decode("1");
    Integer.toString(1);
    Integer.parseUnsignedInt("1");
    Long.parseLong("1");
    Boolean.parseBoolean("true");
    Character.toChars(1);
    Character.isDigit('a');
    Character.codePointCount("abc", 0, 1);
    Double.valueOf(1.0);
    i.intValue();
    i.compareTo(1);
    l.hashCode();
    b.booleanValue();
    ch.charValue();
  }

  void bigs(BigInteger bi, BigDecimal bd, Path p) {
    bi.add(bi);
    bi.intValue();
    bd.setScale(1);
    bd.scale();
    BigInteger.valueOf(1);
    p.resolve("a");
    p.getFileName();
    p.toString();
    p.toFile();
    Paths.get("a");
    Path.of("a");
  }

  void optionals(Optional<String> o, TimeUnit unit, Color color, Class<?> c, Throwable t) throws Exception {
    o.isPresent();
    o.get();
    o.orElse("a");
    Optional.of("a");
    unit.toMillis(1);
    TimeUnit.SECONDS.toNanos(1);
    unit.sleep(1);
    color.name();
    color.ordinal();
    color.compareTo(color);
    Color.valueOf("RED");
    Color.values();
    c.getName();
    c.getMethod("a");
    c.getDeclaredMethod("a");
    c.getField("a");
    Class.forName("a");
    c.isInstance(o);
    c.cast(o);
    t.getMessage();
    t.getCause();
    t.getStackTrace();
    t.fillInStackTrace();
    t.printStackTrace();
    t.addSuppressed(t);
    t.initCause(t);
  }

  void streams(Stream<String> s, List<String> l) {
    s.map(x -> x);
    s.filter(x -> true);
    s.forEach(x -> {});
    s.count();
    s.close();
    l.stream().collect(Collectors.toList());
    Collectors.toList();
    Collectors.joining();
    s.collect(Collectors.toList());
    java.util.stream.IntStream.range(0, 1).sum();
    java.util.stream.IntStream.range(0, 1);
  }

  void functions(Function<String, String> f, Supplier<String> sup, Runnable r) {
    f.apply("a");
    sup.get();
    r.run();
    f.andThen(f);
    Function.identity();
    java.util.function.Predicate<String> p = x -> true;
    p.test("a");
    p.negate();
  }

  void times(Duration d, Instant i, LocalDate ld, ZoneId z, DateTimeFormatter f) {
    d.plusDays(1);
    d.toMillis();
    Duration.ofDays(1);
    Duration.parse("PT1S");
    Instant.now();
    Instant.parse("2020-01-01T00:00:00Z");
    i.plusSeconds(1);
    ld.plusDays(1);
    LocalDate.of(2020, 1, 1);
    LocalDate.parse("2020-01-01");
    LocalDate.from(ld);
    LocalDate.now();
    ZoneId.of("UTC");
    ZoneId.ofOffset("UTC", java.time.ZoneOffset.UTC);
    ZoneId.systemDefault();
    f.parse("x");
    f.format(ld);
    f.withZone(z);
    new java.time.format.DateTimeFormatterBuilder().appendLiteral("a");
    new java.time.format.DateTimeFormatterBuilder().toFormatter();
    java.time.temporal.ChronoField.YEAR.checkValidIntValue(1);
    java.time.temporal.ChronoField.YEAR.checkValidValue(1);
    java.time.temporal.ChronoField.YEAR.range();
    java.time.temporal.ValueRange.of(1, 2).checkValidValue(1, java.time.temporal.ChronoField.YEAR);
    java.time.temporal.ValueRange.of(1, 2).getMinimum();
  }

  void lambdasAndRefs(List<String> list) {
    Runnable r = () -> list.size();
    Runnable r2 = () -> list.add("a");
    Runnable r3 = () -> list.isEmpty();
    Supplier<Integer> s = () -> list.size();
    Runnable r4 = list::size;
    Runnable r5 = list::clear;
    Runnable r6 = list::isEmpty;
    Runnable r7 = String::new;
    Consumer1<String> c1 = String::trim;
    Consumer1<String> c2 = String::length;
    Consumer1<List<String>> c3 = List::size;
    Consumer1<List<String>> c4 = List::clear;
    java.util.function.Consumer<String> c5 = String::trim;
    java.util.function.Consumer<Object> c6 = Object::toString;
    java.util.function.Consumer<Integer> c7 = Integer::intValue;
    java.util.function.Consumer<String> c8 = Integer::parseInt;
    java.util.function.Consumer<String> c9 = Integer::valueOf;
    list.forEach(String::trim);
    list.forEach(x -> x.trim());
    list.forEach(x -> { x.trim(); });
    list.forEach(x -> x.length());
    new Thread(() -> list.size());
  }

  interface Consumer1<T> { void accept(T t); }

  void contexts(List<String> list, String s) {
    int n = list.size();
    boolean b = list.isEmpty() && list.size() > 1;
    for (int i = 0; i < 2; list.size()) {}
    for (list.size(); ; ) { break; }
    if (list.isEmpty()) s.trim();
    else s.length();
    switch (n) { case 1: s.trim(); break; default: break; }
    Runnable r = () -> { s.trim(); };
    s.trim().length();
    list.stream().filter(x -> true).map(x -> x);
  }


  @SuppressWarnings("ReturnValueIgnored")
  void suppressed(String s) {
    s.trim();
  }

  void genericsVoid(java.util.concurrent.Future<Void> f, java.util.concurrent.CompletableFuture<Void> cf) throws Exception {
    f.get();
    cf.get();
    cf.join();
  }

  void tryFail(String s) {
    try {
      s.trim();
      throw new AssertionError();
    } catch (IllegalArgumentException expected) {
    }
  }

}
