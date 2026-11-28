package p;

import java.net.URL;
import java.util.*;

public class A {
    void f(URL u, Map<Object,Object> m, Set<Object> s) {
        Object o = m.get(u);
        m.get(u);
        s.contains(u);
        Map<Object,Object> hm = new HashMap<>();
        hm.get(u);
        hm.get(u);
    }
    void g(URL u, HashMap<Object,Object> m, HashSet<Object> s) {
        m.get(u); m.put(u, u); m.get(u);
        s.add(u); s.contains(u);
        s.remove(u);
    }
    class B<K extends URL> extends HashMap<K, String> { void f(K k) { get(k); put(k, "a"); } }
    void h(URL u, Object... os) {
        Set<Object> s = new HashSet<>();
        s.contains(os[0]);
        s.contains(u);
    }
    void i(URL u) {
        HashSet<Object> s = new HashSet<>();
        Set<Object> t = s;
        t.contains(u);
        s.contains(u);
        ((Set<Object>) s).contains(u);
    }
}
