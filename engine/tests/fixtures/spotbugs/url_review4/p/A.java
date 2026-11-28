package p;

import java.net.URL;
import java.util.*;
import java.util.function.*;
import static java.util.Objects.requireNonNull;

public class A extends HashMap<URL, String> {
    HashSet<URL> hs = new HashSet<>();
    HashMap<URL, String> hm = new HashMap<>();
    URL fu;
    URL[] arr;
    static HashSet<URL> shs = new HashSet<>();
    static { shs.add(null); URL u = null; shs.add(u); }
    HashSet<URL> init = mk(); 
    boolean b0 = hs.contains(fu);
    boolean b1 = hs.contains(arr[0]);
    HashSet<URL> mk() { return null; }
    URL url() { return null; }
    void t1(URL u, boolean c) {
        super.put(u, "x");
        this.put(u, "x");
        put(u, "y");
        get(u);
        super.get(u);
        this.get(u);
        containsKey(u);
        hs.add(c ? u : fu);
        hs.add((URL) (Object) u);
        hs.add(url());
        hs.add(arr[0]);
        hm.get(requireNonNull(u));
        hs.contains(fu);
        hs.contains(u);
        hs.remove(u);
        Runnable r = () -> hs.add(u);
        Consumer<URL> cc = hs::add;
        Predicate<URL> p = hs::contains;
        r.run();
        hs.add(u);
        hs.add(
            u);
        hm.put(
            u,
            "v");
    }
    boolean t2(URL u, Object o) {
        Predicate<URL> p = x -> x.equals(u);
        Function<URL,Integer> f = URL::hashCode;
        boolean q = fu.equals(o);
        int h = fu.hashCode();
        int g = arr[0].hashCode();
        arr[1].equals(o);
        url().equals(o);
        ((URL) o).hashCode();
        return u
            .equals(
               o);
    }
    void t3(URL u) {
        var v = u;
        v.hashCode();
        var hs2 = new HashSet<URL>();
        hs2.add(v);
        HashSet<URL> h3 = hs;
        h3.add(u);
        for (URL x : arr) { hs.add(x); x.hashCode(); }
        new Object() { void f() { hs.add(u); u.hashCode(); } };
    }
    class In { void f(URL u) { hs.add(u); hm.put(u, null); u.equals(null);} }
    static class SN { void f(URL u) { shs.add(u); } }
    void t4(URL u) { Object o = u; hs.add((URL) o); hs.add(u); hs.add(u); hm.put(u,"a"); hm.put(u,"b"); u.hashCode(); u.hashCode(); u.equals(u); }
    void t5(java.net.URL u, java.util.HashSet<java.net.URL> h) { h.add(u); h.contains(u); }
}
