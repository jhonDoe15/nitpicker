package p;

import java.net.URL;
import java.util.*;
import java.util.function.Consumer;

public class A<T extends Set<URL>> {
    void both(Set<URL> s, URL u) {
        s.contains(u);
    }

    void both2(Set<URL> s, URL u) {
        System.out.println();
        HashSet<Object> h = new HashSet<>();
        h.add(u);
    }

    Object anon() {
        return new HashSet<URL>() {
        };
    }

    void lambdaParam() {
        Consumer<Set<URL>> c = s -> System.out.println(s);
        c.accept(null);
    }

    void local() {
        class L {
            Map<URL, String> m;
        }
        System.out.println(new L());
    }

    record R(Set<URL> urls, int x) {
        R {
            System.out.println(x);
        }
    }

    record Q(Map<URL, String> m) {
        public Map<URL, String> m() {
            return m;
        }
    }

    interface J extends Set<URL> {
    }

    static class Gen<K> extends HashMap<K, URL> {
    }

    static class Gen2 extends HashMap<URL, String> {
        Gen2() {
            super();
        }

        void x() {
        }
    }

    enum E {
        A(null);

        E(Set<URL> s) {
        }
    }

    void calls(URL u, Gen2 g) {
        g.put(u, "x");
        g.get(u);
    }

    void qq(URL u, Set<Object> s, Map<Object, Object> m, HashSet<Object> hs) {
        if (s.contains(u)) {
            m.get(u);
        }
        hs.contains(u);
    }

    void gg(URL u) {
        Map<URL, String> m = new HashMap<>();
        m.get(u);
        m.get(u);
    }
}
