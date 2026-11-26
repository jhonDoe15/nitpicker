package p;

import java.util.*;
import java.util.function.*;
import java.util.stream.*;

public class I {
    static <T> void each(Collection<T> items, Consumer<T> action) {}
    static <T, R> R apply(T value, Function<T, R> function) { return null; }
    static <K, V> Map<K, V> mapped(K key, V value) { return null; }
    static <T> T first(List<? extends T> items) { return null; }
    static <T> Optional<T> maybe(Supplier<T> made) { return Optional.empty(); }
    static void run(Runnable runnable) {}

    void implicitParameters(List<String> names, Map<String, List<Integer>> table) {
        each(names, name -> run(() -> name.length()));
        each(table.keySet(), key -> run(() -> key.isEmpty()));
        each(table.values(), values -> run(() -> values.size()));
        table.forEach((key, values) -> run(() -> System.out.println(key + values)));
        names.stream().map(name -> name.length()).forEach(size -> run(() -> System.out.println(size)));
        apply(names, list -> list.get(0)).chars().forEach(code -> run(() -> System.out.println(code)));
        Optional.of(table).map(found -> found.get("a")).ifPresent(list -> run(() -> list.clear()));
        table.entrySet().stream().filter(entry -> entry.getValue().isEmpty())
                .forEach(entry -> run(() -> entry.getKey()));
        Stream.of(1L, 2L).map(value -> value * 2).forEach(value -> run(() -> System.out.println(value)));
        names.stream().collect(Collectors.groupingBy(name -> name.length()))
                .forEach((size, group) -> run(() -> group.add("" + size)));
    }

    void varLocals(List<String> names) {
        var pair = mapped("a", names);
        var head = first(names);
        var made = maybe(() -> names).orElseThrow();
        var applied = apply(3, number -> number.toString());
        var stream = names.stream().map(name -> name.length());
        var entries = mapped(1, 2L).entrySet();
        run(() -> System.out.println(pair.size() + head.length() + made.size() + applied.length() + stream.count()));
        for (var entry : entries) {
            run(() -> System.out.println(entry.getKey() + entry.getValue()));
        }
    }

    static class Base {
        Base(String name, int... sizes) {}
    }

    static class Spread {
        Spread(Object... values) {}
    }

    void varargs() {
        Object a = new Base("a", 1, 2) {};
        Object b = new Base("a") {};
        Object c = new Spread(1, "b") {};
        Object d = new Spread() {};
        Object f = new Spread((Object[]) null) {};
        Object g = new Spread("a") {};
        Object e = new Base("a", new int[] {1}) {};
    }

    interface Named { String name(); }
    static class Shared { }
    static class Left extends Shared implements Named { public String name() { return "l"; } }
    static class Right extends Shared implements Named { public String name() { return "r"; } }

    void intersections(Left left, Right right) {
        Stream.concat(Stream.of(left), Stream.of(right)).map(Named::name).forEach(System.out::println);
        Runnable after = () -> {};
        List<String> names = Stream.of(left, right).map(Named::name).collect(Collectors.toList());
        Runnable last = () -> {};
    }
}
