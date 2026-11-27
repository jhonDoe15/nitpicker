package p;

import java.net.URL;
import java.util.*;

public class A {
    Dictionary<URL, String> dict;
    MyMap<URL> mymap;
    MyTable<URL> mytable;
    Bag<URL> bag;
    Vector<URL> vector;
    Map.Entry<URL, String> entry;
    Hashtable<String, URL> tableValue;
    Optional<URL> opt;
    Comparator<URL> cmp;
    XSet<URL> xset;
    Settings<URL> settings;
    AbstractMap<URL, String> amap;
    Iterable<URL> iter;

    static class MyMap<T> {
        Object get(Object o) {
            return o;
        }
    }

    static class MyTable<T> {
    }

    static class XSet<T> {
    }

    static class Settings<T> {
    }

    abstract static class Bag<T> implements Set<T> {
    }

    void a(URL u, Set<Object> s) {
        s.contains(u);
    }

    void b(URL u, Map<Object, Object> m) {
        m.containsKey(u);
    }

    void c(URL u, Collection<Object> c) {
        c.contains(u);
    }

    void d(URL u, Set<Object> s) {
        s.remove(u);
    }

    void e(URL u, Map<Object, Object> m) {
        m.remove(u);
    }

    void f(URL u, List<Object> l) {
        l.contains(u);
    }

    void g(URL u, Map<Object, Object> m) {
        m.containsValue(u);
    }

    void h(URL u, HashMap<Object, Object> m) {
        m.containsValue(u);
        m.put("x", u);
    }

    void i(URL u, Map<Object, Object> m) {
        m.put(u, u);
    }

    void j(URL u, Set<Object> s) {
        s.add(u);
    }

    void k(Object u, Map<Object, Object> m) {
        m.get(u);
    }

    void l(URL u, Map<Object, Object> m) {
        m.get((Object) u);
    }

    void m(URL u, TreeMap<Object, Object> m) {
        m.get(u);
    }

    void n(URL u, MyMap<Object> m) {
        m.get(u);
    }

    void o(URL u, HashSet<Object> s) {
        s.contains(u);
        s.add(u);
    }

    void p(URL u, Map<Object, Object> m) {
        Object a = m.get(u);
        m.get(u);
    }

    void q(Sub u, Map<Object, Object> m, HashSet<Object> s) {
        m.get(u);
        s.add(u);
    }

    static class Sub {
    }

    void r(URL u, Map<Object, Object> m) {
        Runnable x = () -> m.get(u);
        x.run();
    }
}
