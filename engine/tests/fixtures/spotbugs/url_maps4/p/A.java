package p;

import java.net.URL;
import java.util.*;

public class A {
    Xtable<URL> xtable;
    XHashtable<URL> xhashtable;
    Xmap<URL> xmap;
    Xset<URL> xset;
    Hashtablex<URL> hashtablex;
    private Set<Object> stored = new HashSet<>();
    private Map<Object, Object> storedMap;
    public Set<Object> open = new HashSet<>();

    A() {
        storedMap = new HashMap<>();
    }

    A(Map<URL, String> m) {
        storedMap = new TreeMap<>();
    }

    static class Xtable<T> {
    }

    static class XHashtable<T> {
    }

    static class Xmap<T> {
    }

    static class Xset<T> {
    }

    static class Hashtablex<T> {
    }

    void a(URL u) {
        stored.add(u);
    }

    void b(URL u) {
        storedMap.put(u, u);
    }

    void c(URL u) {
        open.add(u);
    }

    void d(URL u) {
        Map<Object, Object> m = new TreeMap<>();
        m.get(u);
    }

    void e(URL u, boolean f) {
        Map<Object, Object> m = f ? new HashMap<>() : new TreeMap<>();
        m.put(u, u);
    }

    void f(URL u) {
        Map<Object, Object> m = make();
        m.put(u, u);
    }

    Map<Object, Object> make() {
        return new HashMap<>();
    }

    void g(URL u) {
        Object o = u;
        Set<Object> s = new HashSet<>();
        s.add(o);
    }

    void h(URL u) {
        Set<Object> s = new HashSet<>();
        s.add(u);
        s = new TreeSet<>();
        s.add(u);
    }

    class Inner {
        Inner(Set<URL> s) {
        }
    }

    enum E {
        X;

        void m(Set<URL> s) {
        }
    }

    void i(URL[] us) {
        Set<Object> s = new HashSet<>();
        s.add(us[0]);
        Map<Object, Object> m = new HashMap<>();
        m.put(us[0], 1);
        m.get(us[0]);
        System.out.println(s);
    }

    URL url() {
        return null;
    }

    void j() {
        Set<Object> s = new HashSet<>();
        s.add(url());
        System.out.println(s);
    }

    void k(java.util.function.Supplier<Set<URL>> sup) {
    }

    void l(URL u) {
        new HashSet<Object>().add(u);
        Map<Object, Object> m = new HashMap<>();
        m.get(u);
        m.containsKey(u);
    }
}
