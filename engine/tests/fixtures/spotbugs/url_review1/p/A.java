package p;

import java.net.URL;
import java.util.*;
import java.util.function.*;

public class A<T> {
    java.util.Map<java.net.URL, String> fq;
    Map<@Ann URL, String> ann;
    Set<URL> a, b;
    Map<URL, String> arr[];
    <K extends Map<URL, String>> void gm(K k) { int x = 1; }
    @SafeVarargs
    final void va(Set<URL>... s) {
        int y = 2;
    }
    A(Map<URL, String> m) {
        int z = 3;
    }
    <X extends Set<URL>> A(X x, int i) {
        this((Map<URL,String>) null);
    }
    class In {
        Map<URL, String> inner;
        void f(Set<URL> s) { }
    }
    static class SN<Q extends Set<URL>> { }
    interface I extends Map<URL, String> { }
    interface C { Map<URL,String> K = null; Set<URL> m(); default Set<URL> d() { return null; } }
    enum E implements Comparable<E>, Supplier<Set<URL>> { X; public Set<URL> get() { return null; } }
    record R(Map<URL, String> m, int i) {
        R { int q = 1; }
    }
    record R2(Set<URL> s) {
        R2(Set<URL> s) {
            this.s = s;
        }
        public Set<URL> s() { return s; }
    }
    record R3(
        Set<URL> s,
        Map<URL, String> m) {}
    void local() {
        class L extends HashSet<URL> { }
        Object o = new HashMap<URL, String>() { };
        Supplier<Set<URL>> sup = () -> null;
        Runnable r = new Runnable() { Set<URL> f; public void run() { } };
    }
    void multi(
        int a,
        Map<URL, String> m
    ) {
        int q = 0;
    }
}
