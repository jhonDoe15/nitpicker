package p;
import java.util.*;
import java.util.function.*;
import java.io.Serializable;
public class A {
    Runnable f1 = () -> {};
    static Runnable f2 = () -> { Runnable q = () -> {}; };
    Object o1 = new Object() {};
    static Object o2 = new Object() { Object in = new Object() {}; Runnable r = () -> {}; };
    A() { Runnable r = () -> { Object x = new Object() {}; }; }
    A(int a) { this(); Supplier<Object> s = () -> new Object() { Runnable z = () -> {}; }; }
    static { Runnable r = () -> {}; }
    { Runnable r = () -> {}; Object x = new Object() {}; }
    void m(String p, int q, List<String> l) {
        int local = 3; String s2 = "x"; long[] arr = {};
        Runnable r = () -> { System.out.println(s2 + local); Runnable in = () -> System.out.println(arr.length + p.length()); };
        Function<String, Integer> f = x -> x.length() + q;
        BiFunction<String, Map<String, int[]>, Integer> g = (x, y) -> { return l.size() + this.hashCode(); };
        class Loc { int v = local; Runnable r = () -> System.out.println(p); }
        Object an = new Object() { int w = q; String t() { return s2 + l; } };
        new Loc();
        Runnable after = () -> new Loc();
    }
    void m(int overload) { Runnable r = () -> {}; Runnable r2 = (Runnable & Serializable) () -> {}; }
    static <T extends Comparable<T>> void gen(T t, T[] ts) { Supplier<T> s = () -> t; Supplier<T[]> s2 = () -> ts; Function<T, T> id = x -> x; }
    void args() {
        take(() -> new Object() {}, new Object() {});
        take(new Object() {}, () -> new Object() {});
        take2(x -> new Object() {}, new Object() {});
        Runnable a = () -> {}, b = () -> {};
        Runnable mr = this::args; Supplier<A> ctor = A::new;
        Function<Integer, int[]> mk = int[]::new;
    }
    void take(Object a, Object b) {} void take(Supplier<Object> a, Object b) {} void take(Object a, Supplier<Object> b) {}
    void take2(Function<String, Object> a, Object b) {}
    class Inner { Runnable r = () -> {}; Object o = new Object() {}; void im() { Runnable x = () -> System.out.println(f1); } }
    static class Nested { Nested(Runnable r) {} Nested() { this(() -> {}); } void nm() { Object o = new Nested(() -> {}) { Runnable k = () -> {}; }; } }
    interface I { default void d() { Runnable r = () -> {}; } static void s() { Runnable r = () -> {}; } Runnable C = () -> {}; }
    enum E { X { void e() { Runnable r = () -> {}; } }, Y(() -> {}) {}, Z; E() {} E(Runnable r) {} void e() {} Runnable er = () -> {}; }
    record R(int a) { R { Runnable r = () -> {}; } static Runnable sr = () -> {}; }
}
