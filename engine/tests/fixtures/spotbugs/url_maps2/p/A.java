package p;

import java.net.URL;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

public class A {
    TreeSet<URL> tree;
    LinkedHashMap<URL, String> linked;
    Hashtable<URL, String> table;
    IdentityHashMap<URL, String> identity;
    Map<String, Set<URL>> nested;
    Map<Set<URL>, String> nestedKey;
    ConcurrentMap<URL, String> cmap;
    SortedSet<URL> sorted;
    NavigableMap<URL, String> nav;
    WeakHashMap<URL, String> weak;
    EnumMap<?, URL> enums;
    Map<? extends URL, String> wild;
    Set<? super URL> superWild;
    List<Set<URL>> listOfSets;
    Set<URL>[] arrays;
    HashMap<URL, URL> hm;

    void staticTypes(URL u, Set<Object> os, Map<Object, Object> om, Collection<Object> co) {
        os.contains(u);
        om.get(u);
        om.containsKey(u);
        co.contains(u);
        os.remove(u);
        om.remove(u);
    }

    void staticOther(URL u, Set<Object> os, Map<Object, Object> om) {
        boolean a = os.contains(u);
        Object b = om.get(u);
        System.out.println(a + "" + b);
    }

    void tracked(URL u) {
        Map<Object, Object> m = new ConcurrentHashMap<>();
        m.put(u, u);
        Map<Object, Object> h = new Hashtable<>();
        h.put(u, u);
        Set<Object> l = new LinkedHashSet<>();
        l.add(u);
        Map<Object, Object> w = new WeakHashMap<>();
        w.put(u, u);
        Map<Object, Object> v = new HashMap<>();
        v.put("k", u);
        v.remove(u);
        v.putIfAbsent(u, u);
        v.getOrDefault(u, u);
        Set<Object> s = new HashSet<>();
        s.remove(u);
        System.out.println(m + "" + h + l + w + v + s);
    }

    void fieldCall(URL u) {
        tree.add(u);
        hm.put(u, u);
        hm.get(u);
    }

    <T extends Set<URL>> void typeParam(T t) {
        System.out.println(t);
    }

    void lambda(URL u) {
        Runnable r = () -> {
            Set<URL> s = new HashSet<>();
            s.add(u);
            System.out.println(s);
        };
        r.run();
    }

    void localGeneric(Set<Object> in) {
        Set<URL> s = (Set) in;
        System.out.println(s);
    }

    Map<URL, String> twoLine(int x) {
        if (x > 0) {
            return null;
        }
        return null;
    }

    abstract static class Abs {
        abstract Set<URL> m();
    }

    interface I {
        Set<URL> SET = new HashSet<>();

        Map<URL, String> m();

        default Map<URL, String> d() {
            return null;
        }
    }

    record R(Set<URL> urls) {
    }

    static class Impl implements Comparable<Set<URL>> {
        public int compareTo(Set<URL> o) {
            return 0;
        }
    }

    static class MapSub extends AbstractMap<URL, String> {
        public Set<Map.Entry<URL, String>> entrySet() {
            return null;
        }
    }

    void twice(URL u, URL w) {
        Set<Object> s = new HashSet<>();
        s.add(u);
        s.add(w);
        Map<URL, String> m = new HashMap<>();
        System.out.println(s + "" + m);
    }

    void queries(URL u, URL w, Set<Object> os, Map<Object, Object> om) {
        os.contains(u);
        om.get(w);
        os.contains(w);
    }
}
