package p;

import java.util.*;
import java.util.function.*;
import java.util.stream.*;

public class Bounds {
    interface I {}
    interface J {}
    interface L {}
    static class B implements I, J, L {}
    static class C implements I, J {}
    static class D implements J, I, L {}

    static <T> T pick3(T a, T b, T c) { return a; }
    static <T> void run(T t, Consumer<T> c) {}

    void three() { run(pick3(new B(), new C(), new D()), x -> {}); }
    void reordered() { run(pick3(new B(), new D(), new C()), x -> {}); }
    void numbers() { run(pick3(1, 2L, 3.0f), x -> {}); }
    void mixed() { run(pick3(1, "s", 2L), x -> {}); }
    void streamed() { Stream.of(new B(), new C(), new D()).forEach(x -> {}); }
    void twice() { run(pick3(new B(), new D(), new B()), x -> {}); }
    void nested(boolean f, boolean g) { run(f ? new B() : g ? new C() : new D(), x -> {}); }
    void collections() {
        run(pick3(new ArrayList<String>(), new LinkedList<String>(), new ArrayDeque<String>()), x -> {});
    }
    void ternaries(boolean f, boolean g) {
        run(f ? (g ? new ArrayList<String>() : new LinkedList<String>()) : new ArrayDeque<String>(), x -> {});
    }
    void lists() {
        Stream.of(new ArrayList<String>(), new LinkedList<String>(), new ArrayDeque<String>()).forEach(x -> {});
    }
    void sets() {
        Stream.of(new ArrayList<String>(), new LinkedList<String>(), new HashSet<String>()).forEach(x -> {});
    }
    void values() { Stream.of(1, 2L, "s").forEach(x -> {}); }
    void decimals() { Stream.of(Integer.valueOf(1), Long.valueOf(2), new java.math.BigDecimal(1)).forEach(x -> {}); }
    void listed() {
        var all = Arrays.asList(new ArrayList<String>(), new LinkedList<String>(), new HashSet<String>());
        all.forEach(x -> {});
    }
}
