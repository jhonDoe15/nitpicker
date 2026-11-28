package p;

import java.util.*;
import java.util.function.*;

public class S {
    static <T, R> R chain(Function<T, R> first, Supplier<T> second) { return null; }
    static <T> T both(Function<T, T> first, Supplier<T> second) { return null; }
    static <A, B> void pair(BiConsumer<A, B> use, Supplier<A> a, Supplier<B> b) {}

    void stuck() {
        String made = chain(value -> value.toString(), () -> 3);
        Integer same = both(value -> value + 1, () -> 4);
        pair((a, b) -> System.out.println(a + b), () -> "x", () -> 2L);
        Runnable after = () -> {};
        String two = chain2(value -> value.toString(), text -> text.length());
        Long three = chain2(value -> value + 1L, text -> text.length());
        Runnable last = () -> {};
    }

    static <T, R> R chain2(Function<T, R> first, Function<String, T> second) { return null; }

    static class Box<T> {
        Box(Object held) {}
        Box(Object held, Runnable then) {}
    }

    void diamonds() {
        Object a = new Box<>(new Object() {}) {};
        Object b = new Box<String>(new Object() {}) {};
        Object c = new Box<>(new Object() {}, () -> {}) {};
        Object d = new Box<>("plain") {};
        Object e = new Object() {};
    }

    void anonymousTypes() {
        var made = new Object() { int size = 3; };
        Runnable lambda = () -> System.out.println(made.size);
        var other = new Object() { String name = "a"; };
        Object local = new Object() { Object kept = other; };
        Supplier<Object> later = () -> new Object() { Object seen = made; };
    }
}
