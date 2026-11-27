package p;

import java.net.URL;
import java.util.*;

public class A extends HashMap<Object, String> {
    void f(URL u) {
        super.put(u, "x");
    }
}
class B extends HashSet<Object> {
    boolean f(URL u) {
        return super.contains(u);
    }
    void g(URL u) { super.add(u); }
}
class C<K extends URL, S extends Set<K>> {
    Map<K, String> m;
    Set<K> s;
    S s2;
    <Z extends URL> void f(Map<Z, String> z) {}
}
class D {
    Map<URL, String> m, n[];
    Map<URL, String> a() [] { return null; }
    java.util.Map<java.net.@p.Ann URL, String> q;
    java.util.Map<java.net.URL[], String> r;
    Map<p.D.U, String> s;
    class U {}
}
