package p;
import java.util.*;
import java.util.concurrent.*;
public class M {
    Map<String, Integer> map = new HashMap<>();
    HashMap<String, Integer> hm = new HashMap<>();
    TreeMap<String, Integer> tm = new TreeMap<>();
    ConcurrentHashMap<String, Integer> chm = new ConcurrentHashMap<>();
    int x;
    void f1() { for (String k : map.keySet()) { x += map.get(k); } }
    void f2() { for (String k : hm.keySet()) { x += hm.get(k); } }
    void f3() { for (String k : tm.keySet()) { x += tm.get(k); } }
    void f4() { for (String k : chm.keySet()) { x += chm.get(k); } }
    void f5(Map<String, Integer> m) { for (String k : m.keySet()) { x += m.get(k); } }
    void f6(Map<String, Integer> m, Map<String, Integer> o) { for (String k : m.keySet()) { x += o.get(k); } }
    void f7() { for (String k : map.keySet()) { if (map.containsKey(k)) { x++; } } }
    void f8() { Iterator<String> it = map.keySet().iterator(); while (it.hasNext()) { String k = it.next(); x += map.get(k); } }
    void f9() { for (String k : map.keySet()) { x += map.get(k); x += map.get(k); } }
    void f10() { for (String k : map.keySet()) { Integer v = map.get(k); if (v != null) x += v; } }
    void f11() { Set<String> keys = map.keySet(); for (String k : keys) { x += map.get(k); } }
    void f12() { for (String k : map.keySet()) { x += map.get(k + "a"); } }
    void f13() { for (String k : map.keySet()) { map.put(k, 1); } }
    void f14() { for (String k : map.keySet()) { x += map.getOrDefault(k, 0); } }
    void f15() { for (String k : new ArrayList<>(map.keySet())) { x += map.get(k); } }
    void f16() { for (String k : map.keySet()) { String j = k; x += map.get(j); } }
    void f17() { map.keySet().forEach(k -> x += map.get(k)); }
    void f18() { for (String k : map.keySet()) { x += hm.get(k); } }
    void f19() { for (Object k : map.keySet()) { x += map.get(k); } }
    void f20() {
        for (String k : map.keySet()) {
            x += 1;
            x +=
                map.get(k);
        }
    }
    void f21() { for (String k : map.keySet()) { for (String j : hm.keySet()) { x += hm.get(j) + map.get(k); } } }
    void f22(Properties p) { for (Object k : p.keySet()) { x += p.get(k).hashCode(); } }
    void f23() { for (String k : map.keySet()) { x += this.map.get(k); } }
    static Map<String, Integer> S = new HashMap<>();
    static int f24() { int t = 0; for (String k : S.keySet()) { t += S.get(k); } return t; }
}
