package p;

import java.net.URL;
import java.net.URI;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class A {
    private Set<URL> fieldSet = new HashSet<>();
    private Map<URL, String> fieldMap;
    private final Map<String, URL> valueMap = new HashMap<>();
    private List<URL> list = new ArrayList<>();
    private Set<URI> uris = new HashSet<>();
    static Map<URL, Integer> statics = new ConcurrentHashMap<>();
    HashSet<URL> concrete;
    Collection<URL> coll;

    void locals(URL u) {
        Set<URL> s = new HashSet<>();
        s.add(u);
        Map<URL, String> m = new HashMap<>();
        m.put(u, "x");
    }

    void raw(URL u) {
        Set s = new HashSet();
        s.add(u);
        Map m = new HashMap();
        m.put(u, "x");
        m.get(u);
        m.containsKey(u);
        s.contains(u);
    }

    void objects(URL u, Set<Object> os, Map<Object, Object> om) {
        os.add(u);
        om.put(u, u);
        om.put("k", u);
    }

    Set<URL> returns() {
        return null;
    }

    void param(Map<URL, String> p) {
    }

    boolean eq(URL a, URL b) {
        return a.equals(b);
    }

    int hash(URL a) {
        return a.hashCode();
    }

    boolean eqObj(URL a, Object b) {
        return Objects.equals(a, b);
    }

    int hashObj(URL a) {
        return Objects.hash(a);
    }

    boolean eqOther(Object o, URL a) {
        return o.equals(a);
    }

    boolean same(URL a, URL b) {
        return a.sameFile(b);
    }

    String str(URL a) {
        return a.toString();
    }
}
