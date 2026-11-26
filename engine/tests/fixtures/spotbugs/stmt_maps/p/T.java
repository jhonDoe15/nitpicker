package p;
import java.util.*;
import java.util.concurrent.*;
public class T {
    int x;
    static class My extends HashMap<String, Integer> {}
    void h1(IdentityHashMap<String, Integer> m) { for (String k : m.keySet()) { x += m.get(k); } }
    void h2(WeakHashMap<String, Integer> m) { for (String k : m.keySet()) { x += m.get(k); } }
    void h3(NavigableMap<String, Integer> m) { for (String k : m.keySet()) { x += m.get(k); } }
    void h4(ConcurrentMap<String, Integer> m) { for (String k : m.keySet()) { x += m.get(k); } }
    void h5(ConcurrentSkipListMap<String, Integer> m) { for (String k : m.keySet()) { x += m.get(k); } }
    void h6(AbstractMap<String, Integer> m) { for (String k : m.keySet()) { x += m.get(k); } }
    void h7(My m) { for (String k : m.keySet()) { x += m.get(k); } }
    void h8(Map<String, Integer> m) { for (String k : m.keySet()) { x += ((Map<String, Integer>) m).get(k); } }
    void h9(HashMap<String, Integer> m) { Map<String, Integer> n = m; for (String k : n.keySet()) { x += n.get(k); } }
    void h10(Map<String, Integer> m) { for (String k : m.keySet()) { x += m.get((Object) k); } }
    void h11(Map<String, Integer> m) { for (String k : m.keySet()) { Runnable r = () -> x += m.get(k); r.run(); } }
    void h12(Map<String, Integer> m) { for (String k : m.keySet()) { new Object() { void q() { x += m.get(k); } }.q(); } }
    void h13(Map<String, Integer> m, Map<String, Integer> o) { for (String k : m.keySet()) { m = o; x += m.get(k); } }
}
